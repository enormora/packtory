import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { LinkedBundle, LinkedBundleResource } from '../linker/linked-bundle.ts';
import { linkedBundle, bundleResource } from '../test-libraries/bundle-fixtures.ts';
import { createProject } from '../test-libraries/typescript-project.ts';
import { loadBundle } from './load-bundle.ts';

const indexFile = {
    sourceFilePath: '/src/index.js',
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

        const result = loadBundle(createProject, { bundle, transformationsEnabled: true });

        assert.deepStrictEqual(result.loaded[1], { resource });
        assert.strictEqual(result.fileBindings.length, 1);
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
            loadBundle(createProject, { bundle, transformationsEnabled: true });
        }, /^Error: Bundle "package-a" is missing root "missing" referenced by its entry surface$/u);
    });
});
