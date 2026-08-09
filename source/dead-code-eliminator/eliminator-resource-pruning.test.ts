import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { LinkedBundle, LinkedBundleResource } from '../linker/linked-bundle.ts';
import { bundleResource, linkedBundle } from '../test-libraries/bundle-fixtures.ts';
import { createTestEliminator } from '../test-libraries/eliminator-fixtures.ts';
import { collectTargetPaths, inputs } from '../test-libraries/eliminator-test-support.ts';

function resource(
    sourceFilePath: string,
    content: string,
    targetFilePath: string,
    directDependencies: ReadonlySet<string> = new Set<string>()
): LinkedBundleResource {
    return {
        ...bundleResource(sourceFilePath, { content, directDependencies, targetFilePath }),
        isSubstituted: false
    };
}

function bundle(contents: readonly LinkedBundleResource[]): LinkedBundle {
    return linkedBundle({ name: 'a', contents });
}

function explicitResource(sourceFilePath: string, content: string, targetFilePath: string): LinkedBundleResource {
    return {
        ...resource(sourceFilePath, content, targetFilePath),
        isExplicitlyIncluded: true
    };
}

suite('eliminator resource pruning', function () {
    test('eliminate prunes a pure file reached only by removed dead code', async function () {
        const eliminator = createTestEliminator();
        const input = bundle([
            resource(
                '/src/index.js',
                'function dead() { return import("./dead.js"); }\nexport const api = 1;\n',
                'index.js',
                new Set([ '/src/dead.js' ])
            ),
            resource('/src/dead.js', 'export const dead = 1;\n', 'dead.js')
        ]);

        const [ analyzed ] = await eliminator.eliminate(inputs(input));

        assert.deepStrictEqual(collectTargetPaths(analyzed), [ 'index.js' ]);
    });

    test('eliminate prunes a paired source map with its pure dead file', async function () {
        const eliminator = createTestEliminator();
        const input = bundle([
            resource('/src/index.js', 'export const api = 1;\n', 'index.js'),
            resource('/src/dead.js', 'export const dead = 1;\n', 'dead.js', new Set([ '/src/dead.js.map' ])),
            resource('/src/dead.js.map', '{"version":3,"mappings":""}', 'dead.js.map')
        ]);

        const [ analyzed ] = await eliminator.eliminate(inputs(input));

        assert.deepStrictEqual(collectTargetPaths(analyzed), [ 'index.js' ]);
    });

    test('eliminate keeps an empty root file', async function () {
        const eliminator = createTestEliminator();
        const input = bundle([ resource('/src/index.js', 'const dead = 1;\n', 'index.js') ]);

        const [ analyzed ] = await eliminator.eliminate(inputs(input));

        assert.deepStrictEqual(collectTargetPaths(analyzed), [ 'index.js' ]);
        assert.strictEqual(analyzed?.contents[0]?.fileDescription.content, '');
    });

    test('eliminate keeps declaration module files outside surviving runtime edges', async function () {
        const eliminator = createTestEliminator();
        const input = bundle([
            resource('/src/index.js', 'export const api = 1;\n', 'index.js'),
            resource('/src/types.d.cts', 'export type Common = string;\n', 'types.d.cts'),
            resource('/src/types.d.mts', 'export type Module = string;\n', 'types.d.mts')
        ]);

        const [ analyzed ] = await eliminator.eliminate(inputs(input));

        assert.deepStrictEqual(collectTargetPaths(analyzed), [ 'index.js', 'types.d.cts', 'types.d.mts' ]);
    });

    test('eliminate keeps a pure file reached by a surviving bare import', async function () {
        const eliminator = createTestEliminator();
        const input = bundle([
            resource(
                '/src/index.js',
                'import "./empty.js";\nexport const api = 1;\n',
                'index.js',
                new Set([ '/src/empty.js' ])
            ),
            resource('/src/empty.js', 'export const dead = 1;\n', 'empty.js')
        ]);

        const [ analyzed ] = await eliminator.eliminate(inputs(input));

        assert.deepStrictEqual(collectTargetPaths(analyzed), [ 'index.js', 'empty.js' ]);
    });

    test('eliminate keeps an unreferenced side-effecting file', async function () {
        const eliminator = createTestEliminator();
        const input = bundle([
            resource('/src/index.js', 'export const api = 1;\n', 'index.js'),
            resource('/src/side.js', 'console.log("side");\n', 'side.js')
        ]);

        const [ analyzed ] = await eliminator.eliminate(inputs(input));

        assert.deepStrictEqual(collectTargetPaths(analyzed), [ 'index.js', 'side.js' ]);
    });

    test('eliminate keeps an explicitly included pure runtime file', async function () {
        const eliminator = createTestEliminator();
        const input = bundle([
            resource('/src/index.js', 'export const api = 1;\n', 'index.js'),
            explicitResource('/src/dead.js', '', 'dead.js')
        ]);

        const [ analyzed ] = await eliminator.eliminate(inputs(input));

        assert.deepStrictEqual(collectTargetPaths(analyzed), [ 'index.js', 'dead.js' ]);
    });

    test('eliminate keeps an explicitly included map paired with a pruned file', async function () {
        const eliminator = createTestEliminator();
        const input = bundle([
            resource('/src/index.js', 'export const api = 1;\n', 'index.js'),
            resource('/src/dead.js', 'export const dead = 1;\n', 'dead.js'),
            explicitResource('/src/dead.js.map', '{"version":3,"mappings":""}', 'dead.js.map')
        ]);

        const [ analyzed ] = await eliminator.eliminate(inputs(input));

        assert.deepStrictEqual(collectTargetPaths(analyzed), [ 'index.js', 'dead.js.map' ]);
    });

    test('eliminate keeps all files when transformations are disabled', async function () {
        const eliminator = createTestEliminator();
        const input = bundle([
            resource('/src/index.js', 'export const api = 1;\n', 'index.js'),
            resource('/src/dead.js', '', 'dead.js')
        ]);

        const [ analyzed ] = await eliminator.eliminate([ {
            bundle: input,
            transformationsEnabled: false
        } ]);

        assert.deepStrictEqual(collectTargetPaths(analyzed), [ 'index.js', 'dead.js' ]);
    });
});
