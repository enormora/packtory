import assert from 'node:assert';
import path from 'node:path';
import { suite, test } from 'mocha';
import { z } from 'zod/mini';
import { withCompilerWorkspace, type CompilerWorkspace } from '../../source/test-libraries/compiler-workspace.ts';
import type { ResolvedPackage } from '../../source/packtory/resolved-package.ts';
import { resolveAndLinkAll } from '../../source/packages/packtory/packtory.entry-point.ts';
import { assertDefined } from '../../source/test-libraries/deep-subset-assertion.ts';
import { loadPackageManifest } from '../load-package-manifest.ts';

async function writeFixture(workspace: CompilerWorkspace): Promise<void> {
    const readFixtureText = workspace.fileManager.readFile;
    const content = await readFixtureText(
        path.join(
            process.cwd(),
            'integration-tests/fixtures/dead-code-elimination-declaration-reexports/sources.json'
        )
    );
    const files = z.record(z.string(), z.string()).parse(JSON.parse(content));
    await Promise.all(
        Object.entries(files).map(async function ([ name, source ]) {
            await workspace.write(name, source);
        })
    );
}

async function resolveFixture(sourcesFolder: string, entry: string): Promise<ResolvedPackage> {
    const outcome = await resolveAndLinkAll({
        checks: { typeScriptIntegrity: { enabled: true, declarations: 'all' } },
        commonPackageSettings: {
            sourcesFolder,
            mainPackageManifest: await loadPackageManifest(sourcesFolder),
            publishSettings: { access: 'public' }
        },
        packages: [ {
            name: 'declaration-repro',
            roots: { main: { javaScript: `${entry}.js`, declarationFile: `${entry}.d.ts` } },
            defaultModuleRoot: 'main'
        } ]
    });
    if (!outcome.result.isOk) {
        assert.fail(JSON.stringify(outcome.result.error));
    }
    const [ resolvedPackage ] = outcome.result.value;
    assertDefined(resolvedPackage);
    return resolvedPackage;
}

function assertPrivateHelperDeclarationAbsent(declarations: ReadonlyMap<string, string>): void {
    for (const [ targetFilePath, content ] of declarations) {
        if (targetFilePath.endsWith('.d.ts')) {
            assert.strictEqual(content.includes('function keep'), false, content);
        }
    }
}

function assertDeclarationExports(resolvedPackage: ResolvedPackage, requiresReader: boolean): void {
    const declarations = new Map(resolvedPackage.analyzedBundle.contents.map(function (resource) {
        return [ resource.fileDescription.targetFilePath, resource.fileDescription.content ];
    }));
    assertPrivateHelperDeclarationAbsent(declarations);
    const barrel = declarations.get('barrel.d.ts');
    const context = declarations.get('context.d.ts');
    assertDefined(barrel);
    assertDefined(context);
    assert.match(barrel, /export type \{ Context \} from "\.\/context\.ts"/u);
    assert.match(context, /export type Context = \{ value: string \}/u);
    assert.strictEqual(barrel.includes('readContext'), requiresReader);
    assert.strictEqual(context.includes('readContext'), requiresReader);
}

suite('dead-code-elimination declaration reexports', function () {
    for (
        const scenario of [
            { entry: 'index', requiresReader: false },
            { entry: 'with-internal-value', requiresReader: false },
            { entry: 'with-typeof', requiresReader: true },
            { entry: 'with-value', requiresReader: true }
        ]
    ) {
        test(`keeps declaration reexports consistent for ${scenario.entry}`, async function () {
            await withCompilerWorkspace(async function (workspace) {
                await writeFixture(workspace);
                const resolvedPackage = await resolveFixture(workspace.folder, scenario.entry);
                assertDeclarationExports(resolvedPackage, scenario.requiresReader);
                const runtimeReader = resolvedPackage.analyzedBundle.contents.some(function (resource) {
                    return resource.fileDescription.targetFilePath.endsWith('.js') &&
                        resource.fileDescription.content.includes('function readContext');
                });
                assert.strictEqual(runtimeReader, scenario.entry === 'with-value');
            });
        });
    }
});
