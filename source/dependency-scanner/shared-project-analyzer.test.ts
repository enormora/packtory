import assert from 'node:assert';
import { suite, test } from 'mocha';
import {
    withCompilerWorkspace,
    createProjectWithUntrackedInputs,
    type CompilerWorkspace
} from '../test-libraries/compiler-workspace.ts';
import { createSharedProjectAnalyzer } from './shared-project-analyzer.ts';
import type { TypescriptProject } from './typescript-project-analyzer.ts';
import type { AnalyzationOptions } from './typescript-compiler-options.ts';
import { getReferencedModules } from './source-file-references.ts';

type Sources = {
    readonly workspace: CompilerWorkspace;
    readonly first: string;
    readonly second: string;
    readonly shared: string;
    readonly runtime: () => Promise<TypescriptProject>;
    readonly analyze: (options: AnalyzationOptions) => Promise<TypescriptProject>;
};
const runtimeOptions: AnalyzationOptions = { resolveDeclarationFiles: false, mainPackageManifest: { type: 'module' } };

async function withSharedSources(run: (sources: Sources) => Promise<void>): Promise<void> {
    await withCompilerWorkspace(async function (workspace) {
        const [ first, second, shared ] = await Promise.all([
            workspace.write('first.js', 'export { value } from "./shared.js";'),
            workspace.write('second.js', 'import "./shared.js";'),
            workspace.write('shared.js', 'export const value = 1;')
        ]);
        const analyzer = createSharedProjectAnalyzer({ ...workspace, getReferencedModules });
        await run({
            workspace,
            first,
            second,
            shared,
            async runtime() {
                return analyzer.analyzeProject(workspace.folder, runtimeOptions);
            },
            async analyze(options) {
                return analyzer.analyzeProject(workspace.folder, options);
            }
        });
    });
}

function dependenciesOf(project: TypescriptProject, entry: string): readonly string[] {
    return project.getReferencedModules(entry).flatMap(function (reference) {
        return reference.kind === 'external-package' ? [] : [ reference.filePath ];
    });
}

suite('shared project analysis', function () {
    test('rebuilds projects after unsupported compiler input observations', async function () {
        await withCompilerWorkspace(async function (workspace) {
            const file = await workspace.write('index.js', 'export const value = 1;');
            const analyzer = createSharedProjectAnalyzer({
                ...workspace,
                getReferencedModules,
                Project: createProjectWithUntrackedInputs(workspace.Project)
            });
            const first = await analyzer.analyzeProject(workspace.folder, runtimeOptions);
            assert.deepStrictEqual(dependenciesOf(first, file), []);
            const second = await analyzer.analyzeProject(workspace.folder, runtimeOptions);
            assert.deepStrictEqual(dependenciesOf(second, file), []);
            assert.strictEqual(workspace.projectCount(), 2);
        });
    });

    test('preserves conditional import ordering in shared compiler inputs', async function () {
        await withSharedSources(async function (sources) {
            const entry = await sources.workspace.write('conditional.js', 'import "#shared";');
            const options = {
                resolveDeclarationFiles: false,
                mainPackageManifest: {
                    type: 'module' as const,
                    imports: {
                        '#shared': { default: './shared.js', types: './second.js' }
                    }
                }
            };
            const initial = await sources.analyze(options);
            assert.deepStrictEqual(dependenciesOf(initial, entry), [ sources.shared ]);
            options.mainPackageManifest.imports['#shared'] = { types: './second.js', default: './shared.js' };
            const changed = await sources.analyze(options);
            assert.deepStrictEqual(dependenciesOf(changed, entry), [ sources.second ]);
        });
    });

    test('observes virtual manifest edits when callers reuse their options object', async function () {
        await withSharedSources(async function (sources) {
            const entry = await sources.workspace.write('hash.js', 'import "#shared";');
            const options = {
                resolveDeclarationFiles: false,
                mainPackageManifest: { type: 'module' as const, imports: { '#shared': './shared.js' } }
            };
            const initial = await sources.analyze(options);
            assert.deepStrictEqual(dependenciesOf(initial, entry), [ sources.shared ]);
            options.mainPackageManifest.imports['#shared'] = './second.js';
            const changed = await sources.analyze(options);
            assert.deepStrictEqual(dependenciesOf(changed, entry), [ sources.second ]);
        });
    });

    test('reuses reachable sources across entry points and repeated lookups', async function () {
        await withSharedSources(async function (sources) {
            const initial = await sources.runtime();
            assert.deepStrictEqual(dependenciesOf(initial, sources.first), [ sources.shared ]);
            const repeated = await sources.runtime();
            assert.strictEqual(repeated.getProject(), initial.getProject());
            assert.deepStrictEqual(dependenciesOf(repeated, sources.second), [ sources.shared ]);
            assert.deepStrictEqual(dependenciesOf(repeated, sources.first), [ sources.shared ]);
            assert.strictEqual(sources.workspace.projectCount(), 1);
        });
    });

    test('observes newly added higher-priority resolution candidates', async function () {
        await withSharedSources(async function (sources) {
            const initial = await sources.runtime();
            assert.deepStrictEqual(dependenciesOf(initial, sources.first), [ sources.shared ]);
            const preferred = await sources.workspace.write('shared.ts', 'export const value = 2;');
            const changed = await sources.runtime();
            assert.deepStrictEqual(dependenciesOf(changed, sources.first), [ preferred ]);
            assert.strictEqual(sources.workspace.projectCount(), 2);
        });
    });

    test('observes changed source contents', async function () {
        await withSharedSources(async function (sources) {
            const initial = await sources.runtime();
            assert.deepStrictEqual(dependenciesOf(initial, sources.first), [ sources.shared ]);
            await sources.workspace.write('first.js', 'export const value = 3;');
            const edited = await sources.runtime();
            assert.deepStrictEqual(dependenciesOf(edited, sources.first), []);
        });
    });

    test('separates runtime and declaration compiler modes', async function () {
        await withSharedSources(async function (sources) {
            const initial = await sources.runtime();
            const types = await sources.analyze({ ...runtimeOptions, resolveDeclarationFiles: true });
            assert.notStrictEqual(types.getProject(), initial.getProject());
            const repeated = await sources.runtime();
            assert.strictEqual(repeated.getProject(), initial.getProject());
        });
    });

    test('replaces a stale project without evicting the other compiler mode', async function () {
        await withSharedSources(async function (sources) {
            const typeFile = await sources.workspace.write('types.d.ts', 'export declare const value: number;');
            const initial = await sources.runtime();
            assert.deepStrictEqual(dependenciesOf(initial, sources.first), [ sources.shared ]);
            const declarations = await sources.analyze({ ...runtimeOptions, resolveDeclarationFiles: true });
            assert.deepStrictEqual(dependenciesOf(declarations, typeFile), []);
            await sources.workspace.write('types.d.ts', 'export { value } from "./second.js";');
            assert.deepStrictEqual(
                dependenciesOf(await sources.analyze({ ...runtimeOptions, resolveDeclarationFiles: true }), typeFile),
                [ sources.second ]
            );
            const repeated = await sources.runtime();
            assert.strictEqual(repeated.getProject(), initial.getProject());
            assert.strictEqual(sources.workspace.projectCount(), 3);
        });
    });

    test('separates virtual manifests and bounds retained projects', async function () {
        await withSharedSources(async function (sources) {
            const initial = await sources.runtime();
            await sources.analyze({ ...runtimeOptions, resolveDeclarationFiles: true });
            await sources.analyze({
                ...runtimeOptions,
                mainPackageManifest: { type: 'module', imports: { '#changed': './first.js' } }
            });
            const repeated = await sources.runtime();
            assert.notStrictEqual(repeated.getProject(), initial.getProject());
            assert.strictEqual(sources.workspace.projectCount(), 4);
        });
    });
});
