import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { LinkedBundle, LinkedBundleResource } from '../linker/linked-bundle.ts';
import { bundleResource, linkedBundle } from '../test-libraries/bundle-fixtures.ts';
import { createTestEliminator } from '../test-libraries/eliminator-fixtures.ts';
import {
    collectTargetPaths,
    inputs,
    inputWithoutTransformations,
    inputWithSubstitutionPublicModules
} from '../test-libraries/eliminator-test-support.ts';

function resource(
    inputFilePath: string,
    content: string,
    targetFilePath: string,
    directDependencies: ReadonlySet<string> = new Set<string>()
): LinkedBundleResource {
    return {
        ...bundleResource(inputFilePath, { content, directDependencies, targetFilePath }),
        isSubstituted: false
    };
}

function bundle(contents: readonly LinkedBundleResource[]): LinkedBundle {
    return linkedBundle({ name: 'a', contents });
}

function explicitResource(inputFilePath: string, content: string, targetFilePath: string): LinkedBundleResource {
    return {
        ...resource(inputFilePath, content, targetFilePath),
        isExplicitlyIncluded: true
    };
}

suite('eliminator resource pruning', function () {
    test('eliminate prunes a pure file reached only by removed dead code', async function () {
        const eliminator = createTestEliminator();
        const input = bundle([
            resource(
                '/source/index.js',
                'function dead() { return import("./dead.js"); }\nexport const api = 1;\n',
                'index.js',
                new Set([ '/source/dead.js' ])
            ),
            resource('/source/dead.js', 'export const dead = 1;\n', 'dead.js')
        ]);

        const [ analyzed ] = await eliminator.eliminate(inputs(input));

        assert.deepStrictEqual(collectTargetPaths(analyzed), [ 'index.js' ]);
    });

    test('eliminate prunes a paired source map with its pure dead file', async function () {
        const eliminator = createTestEliminator();
        const input = bundle([
            resource('/source/index.js', 'export const api = 1;\n', 'index.js'),
            resource('/source/dead.js', 'export const dead = 1;\n', 'dead.js', new Set([ '/source/dead.js.map' ])),
            resource('/source/dead.js.map', '{"version":3,"mappings":""}', 'dead.js.map')
        ]);

        const [ analyzed ] = await eliminator.eliminate(inputs(input));

        assert.deepStrictEqual(collectTargetPaths(analyzed), [ 'index.js' ]);
    });

    test('eliminate keeps an empty root file', async function () {
        const eliminator = createTestEliminator();
        const input = bundle([ resource('/source/index.js', 'const dead = 1;\n', 'index.js') ]);

        const [ analyzed ] = await eliminator.eliminate(inputs(input));

        assert.deepStrictEqual(collectTargetPaths(analyzed), [ 'index.js' ]);
        assert.strictEqual(analyzed?.contents[0]?.fileDescription.content, '');
    });

    test('eliminate prunes declaration module files outside the public declaration surface', async function () {
        const eliminator = createTestEliminator();
        const input = bundle([
            resource('/source/index.js', 'export const api = 1;\n', 'index.js'),
            resource('/source/types.d.cts', 'export type Common = string;\n', 'types.d.cts'),
            resource('/source/types.d.mts', 'export type Module = string;\n', 'types.d.mts')
        ]);

        const [ analyzed ] = await eliminator.eliminate(inputs(input));

        assert.deepStrictEqual(collectTargetPaths(analyzed), [ 'index.js' ]);
    });

    test('eliminate prunes a paired declaration source map with its dead declaration file', async function () {
        const eliminator = createTestEliminator();
        const input = bundle([
            resource('/source/index.js', 'export const api = 1;\n', 'index.js'),
            resource(
                '/source/dead.d.ts',
                'export type Dead = string;\n',
                'dead.d.ts',
                new Set([ '/source/dead.d.ts.map' ])
            ),
            resource('/source/dead.d.ts.map', '{"version":3,"mappings":""}', 'dead.d.ts.map')
        ]);

        const [ analyzed ] = await eliminator.eliminate(inputs(input));

        assert.deepStrictEqual(collectTargetPaths(analyzed), [ 'index.js' ]);
    });

    suite('retained runtime files', function () {
        test('eliminate keeps a pure file reached by a surviving bare import', async function () {
            const eliminator = createTestEliminator();
            const input = bundle([
                resource(
                    '/source/index.js',
                    'import "./empty.js";\nexport const api = 1;\n',
                    'index.js',
                    new Set([ '/source/empty.js' ])
                ),
                resource('/source/empty.js', 'export const dead = 1;\n', 'empty.js')
            ]);

            const [ analyzed ] = await eliminator.eliminate(inputs(input));

            assert.deepStrictEqual(collectTargetPaths(analyzed), [ 'index.js', 'empty.js' ]);
        });

        test('eliminate keeps a declaration companion for a substitution-public runtime module', async function () {
            const eliminator = createTestEliminator();
            const declarationRoot = {
                content: 'export type Api = string;\n',
                isExecutable: false,
                inputFilePath: '/source/index.d.ts',
                targetFilePath: 'index.d.ts'
            };
            const input = linkedBundle({
                name: 'a',
                contents: [
                    resource(
                        '/source/index.js',
                        'import "./feature.js";\nexport const api = 1;\n',
                        'index.js',
                        new Set([ '/source/feature.js' ])
                    ),
                    { ...bundleResource('/source/index.d.ts', declarationRoot), isSubstituted: false },
                    resource('/source/feature.js', 'export const feature = 1;\n', 'feature.js'),
                    resource('/source/feature.d.ts', 'export type Feature = string;\n', 'feature.d.ts')
                ],
                roots: {
                    main: {
                        javaScript: {
                            content: '',
                            isExecutable: false,
                            inputFilePath: '/source/index.js',
                            targetFilePath: 'index.js'
                        },
                        declarationFile: declarationRoot
                    }
                }
            });

            const [ analyzed ] = await eliminator.eliminate(
                inputWithSubstitutionPublicModules(input, new Set([ '/source/feature.js' ]))
            );
            const featureDeclaration = analyzed?.contents.find(function (entry) {
                return entry.fileDescription.targetFilePath === 'feature.d.ts';
            });

            assert.deepStrictEqual(collectTargetPaths(analyzed), [
                'index.js',
                'index.d.ts',
                'feature.js',
                'feature.d.ts'
            ]);
            assert.strictEqual(featureDeclaration?.fileDescription.content, 'export type Feature = string;\n');
        });

        test('eliminate keeps a substitution-public runtime module that has no local importer', async function () {
            const eliminator = createTestEliminator();
            const input = bundle([
                resource('/source/index.js', 'export const api = 1;\n', 'index.js'),
                resource('/source/feature.js', 'export const feature = 1;\n', 'feature.js')
            ]);

            const [ analyzed ] = await eliminator.eliminate(
                inputWithSubstitutionPublicModules(input, new Set([ '/source/feature.js' ]))
            );

            assert.deepStrictEqual(collectTargetPaths(analyzed), [ 'index.js', 'feature.js' ]);
        });
    });

    test('eliminate keeps an unreferenced side-effecting file', async function () {
        const eliminator = createTestEliminator();
        const input = bundle([
            resource('/source/index.js', 'export const api = 1;\n', 'index.js'),
            resource('/source/side.js', 'console.log("side");\n', 'side.js')
        ]);

        const [ analyzed ] = await eliminator.eliminate(inputs(input));

        assert.deepStrictEqual(collectTargetPaths(analyzed), [ 'index.js', 'side.js' ]);
    });

    test('eliminate keeps an explicitly included pure runtime file', async function () {
        const eliminator = createTestEliminator();
        const input = bundle([
            resource('/source/index.js', 'export const api = 1;\n', 'index.js'),
            explicitResource('/source/dead.js', '', 'dead.js')
        ]);

        const [ analyzed ] = await eliminator.eliminate(inputs(input));

        assert.deepStrictEqual(collectTargetPaths(analyzed), [ 'index.js', 'dead.js' ]);
    });

    test('eliminate keeps an explicitly included map paired with a pruned file', async function () {
        const eliminator = createTestEliminator();
        const input = bundle([
            resource('/source/index.js', 'export const api = 1;\n', 'index.js'),
            resource('/source/dead.js', 'export const dead = 1;\n', 'dead.js'),
            explicitResource('/source/dead.js.map', '{"version":3,"mappings":""}', 'dead.js.map')
        ]);

        const [ analyzed ] = await eliminator.eliminate(inputs(input));

        assert.deepStrictEqual(collectTargetPaths(analyzed), [ 'index.js', 'dead.js.map' ]);
    });

    test('eliminate keeps all files when transformations are disabled', async function () {
        const eliminator = createTestEliminator();
        const input = bundle([
            resource('/source/index.js', 'export const api = 1;\n', 'index.js'),
            resource('/source/dead.js', '', 'dead.js')
        ]);

        const [ analyzed ] = await eliminator.eliminate(inputWithoutTransformations(input));

        assert.deepStrictEqual(collectTargetPaths(analyzed), [ 'index.js', 'dead.js' ]);
    });
});
