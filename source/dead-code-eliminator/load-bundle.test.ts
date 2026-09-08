import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { LinkedBundle, LinkedBundleResource } from '../linker/linked-bundle.ts';
import { linkedBundle, bundleResource } from '../test-libraries/bundle-fixtures.ts';
import { createProject } from '../test-libraries/typescript-project.ts';
import type { EliminationInput } from './analyzed-bundle.ts';
import { loadBundle } from './load-bundle.ts';

const indexFile = {
    inputFilePath: '/src/index.js',
    targetFilePath: 'index.js',
    content: 'export const value = 1;\n',
    isExecutable: false
};

function indexResource(): LinkedBundleResource {
    return {
        ...bundleResource('/src/index.js', {
            content: indexFile.content,
            targetFilePath: indexFile.targetFilePath
        }),
        isSubstituted: false
    };
}

function packageABundle(overrides: Partial<Parameters<typeof linkedBundle>[0]> = {}): LinkedBundle {
    return linkedBundle({
        name: 'package-a',
        roots: { main: { js: indexFile } },
        contents: [ indexResource() ],
        ...overrides
    });
}

function loadInput(
    bundle: LinkedBundle,
    substitutionPublicModuleInputFilePaths: ReadonlySet<string> = new Set<string>()
): EliminationInput {
    return { bundle, transformationsEnabled: true, substitutionPublicModuleInputFilePaths };
}

suite('load-bundle', function () {
    test('loadBundle() keeps non-code resources out of source-file analysis', function () {
        const resource = {
            ...bundleResource('/src/readme.md', {
                content: 'Hello',
                targetFilePath: 'readme.md'
            }),
            isSubstituted: false
        };
        const bundle = packageABundle({ contents: [ indexResource(), resource ] });

        const result = loadBundle(createProject, loadInput(bundle), undefined);

        assert.deepStrictEqual(result.loaded[1], { resource });
        assert.strictEqual(result.fileBindings.length, 1);
    });

    test('loadBundle() overwrites duplicate source files inside one project', function () {
        const duplicateResource = {
            ...bundleResource('/src/index.js', {
                content: 'export const value = 2;\n',
                targetFilePath: 'index.js'
            }),
            isSubstituted: false
        };
        const bundle = packageABundle({ contents: [ indexResource(), duplicateResource ] });

        const result = loadBundle(createProject, loadInput(bundle), undefined);

        assert.strictEqual(result.fileBindings.length, 2);
        assert.strictEqual(result.fileBindings[1]?.sourceFile.getFullText(), duplicateResource.fileDescription.content);
    });

    test('loadBundle() throws when the public surface references a missing root', function () {
        const bundle = packageABundle({
            surface: {
                mode: 'explicit',
                packageInterface: {
                    modules: [ { root: 'missing', export: '.' } ]
                }
            }
        });

        assert.throws(function () {
            loadBundle(createProject, loadInput(bundle), undefined);
        }, /^Error: Bundle "package-a" is missing root "missing" referenced by its entry surface$/u);
    });

    test('loadBundle() seeds substitution public modules by target path', function () {
        const publicResource = {
            ...bundleResource('/src/public.js', {
                content: 'export const api = 1;\n',
                targetFilePath: 'public.js'
            }),
            isSubstituted: false
        };
        const bundle = packageABundle({ contents: [ indexResource(), publicResource ] });

        const result = loadBundle(createProject, loadInput(bundle, new Set([ '/src/public.js' ])), undefined);

        assert.strictEqual(result.reachability.localReachable.has('public.js::api'), true);
    });

    test('loadBundle() ignores missing substitution public modules', function () {
        const bundle = packageABundle();

        const result = loadBundle(createProject, loadInput(bundle, new Set([ '/src/missing.js' ])), undefined);

        assert.deepStrictEqual(result.reachability.localReachable, new Set([ 'index.js::value' ]));
    });
});
