import assert from 'node:assert';
import { suite, test } from 'mocha';
import { linkedBundle } from '../../test-libraries/bundle-fixtures.ts';
import { createProject } from '../../test-libraries/typescript-project.ts';
import type { FileBindings } from '../reachability/local-seed-gathering.ts';
import { indexBundles, type IndexedBundle } from './bundle-index.ts';
import { walkCrossBundleStatements, type WalkContext } from './import-export-walker.ts';
import { createSeedStore, type SeedMap } from './seed-store.ts';

function emptyIndex(): ReadonlyMap<string, IndexedBundle> {
    return indexBundles([ { bundle: linkedBundle({ name: 'pkg-a' }), fileBindings: [] } ]);
}

function walkContent(
    content: string,
    localReachable: ReadonlySet<string> = new Set(),
    overrides: Partial<WalkContext> = {}
): SeedMap {
    const project = createProject({ withFiles: [ { filePath: '/a/index.ts', content } ] });
    const sourceFile = project.getSourceFileOrThrow('/a/index.ts');
    const seeds = createSeedStore();
    return walkCrossBundleStatements(sourceFile, {
        indexed: emptyIndex(),
        seeds,
        sourceBundleName: 'pkg-a',
        inputFilePath: sourceFile.getFilePath(),
        sourceTargetFilePath: 'index.ts',
        moduleReferences: [],
        localReachable,
        trace: undefined,
        ...overrides
    });
}

function indexedBundleWithFiles(name: string, files: readonly string[]): ReadonlyMap<string, IndexedBundle> {
    const project = createProject({
        withFiles: files.map(function (targetFilePath) {
            return { filePath: `/${name}/${targetFilePath}`, content: 'export const remote = 1;' };
        })
    });
    const fileBindings = files.map(function (targetFilePath): FileBindings {
        const sourceFile = project.getSourceFileOrThrow(`/${name}/${targetFilePath}`);
        const declaration = sourceFile.getVariableDeclarationOrThrow('remote');
        return {
            inputFilePath: `/${name}/${targetFilePath}`,
            parsedInputFilePath: `/${name}/${targetFilePath}`,
            targetFilePath,
            moduleReferences: [],
            bindings: [
                {
                    name: 'remote',
                    declarationNode: declaration,
                    referenceNode: declaration,
                    statement: declaration.getVariableStatementOrThrow(),
                    isExported: true
                }
            ],
            sourceFile
        };
    });
    return indexBundles([ { bundle: linkedBundle({ name }), fileBindings } ]);
}

function indexedBundleWithMissingBindings(name: string, targetFilePath: string): ReadonlyMap<string, IndexedBundle> {
    return new Map([
        [
            name,
            {
                bundle: linkedBundle({ name }),
                bindingsByFilePath: new Map([ [ targetFilePath, undefined as unknown as FileBindings ] ])
            }
        ]
    ]);
}

suite('import-export-walker', function () {
    test('walkCrossBundleStatements does nothing when the file has no import or export statements', function () {
        assert.strictEqual(walkContent('const x = 1;').size, 0);
    });

    test('walkCrossBundleStatements ignores imports whose specifier matches no indexed bundle', function () {
        assert.strictEqual(walkContent('import { x } from "external";', new Set([ 'x' ])).size, 0);
    });

    test('walkCrossBundleStatements ignores exports whose specifier matches no indexed bundle', function () {
        assert.strictEqual(walkContent('export { x } from "external";').size, 0);
    });

    test('walkCrossBundleStatements skips bare re-exports that have no module specifier', function () {
        assert.strictEqual(walkContent('function helper() { return 1; }\nexport { helper };').size, 0);
    });

    test('walkCrossBundleStatements does not resolve bare re-exports through malformed references', function () {
        const seeds = walkContent(
            'function helper() { return 1; }\nexport { helper };',
            new Set(),
            {
                indexed: indexedBundleWithFiles('pkg-b', [ 'remote.js' ]),
                moduleReferences: [
                    {
                        type: 'linked-code',
                        packageName: 'pkg-b',
                        sourceSpecifier: 'pkg-b',
                        emittedSpecifier: undefined as unknown as string,
                        targetFilePath: 'remote.js'
                    }
                ]
            }
        );

        assert.strictEqual(seeds.size, 0);
    });

    test('walkCrossBundleStatements ignores linked references whose package is not indexed', function () {
        const seeds = walkContent(
            'import { remote } from "pkg-b/remote.js";\nconsole.log(remote);',
            new Set([ 'index.ts::remote' ]),
            {
                moduleReferences: [
                    {
                        type: 'linked-code',
                        packageName: 'pkg-b',
                        sourceSpecifier: './remote.js',
                        emittedSpecifier: 'pkg-b/remote.js',
                        targetFilePath: 'remote.js'
                    }
                ]
            }
        );

        assert.strictEqual(seeds.size, 0);
    });

    test('walkCrossBundleStatements ignores linked references whose target file is not indexed', function () {
        const seeds = walkContent(
            'import { remote } from "pkg-b/missing.js";\nconsole.log(remote);',
            new Set([ 'index.ts::remote' ]),
            {
                indexed: indexedBundleWithFiles('pkg-b', [ 'remote.js' ]),
                moduleReferences: [
                    {
                        type: 'linked-code',
                        packageName: 'pkg-b',
                        sourceSpecifier: './missing.js',
                        emittedSpecifier: 'pkg-b/missing.js',
                        targetFilePath: 'missing.js'
                    }
                ]
            }
        );

        assert.strictEqual(seeds.size, 0);
    });

    test('walkCrossBundleStatements skips namespace imports when indexed bindings are missing', function () {
        const seeds = walkContent(
            'import * as remote from "pkg-b/remote.js";\nconsole.log(remote);',
            new Set([ 'index.ts::remote' ]),
            {
                indexed: indexedBundleWithMissingBindings('pkg-b', 'remote.js'),
                moduleReferences: [
                    {
                        type: 'linked-code',
                        packageName: 'pkg-b',
                        sourceSpecifier: './remote.js',
                        emittedSpecifier: 'pkg-b/remote.js',
                        targetFilePath: 'remote.js'
                    }
                ]
            }
        );

        assert.strictEqual(seeds.size, 0);
    });

    test('walkCrossBundleStatements seeds only the linked reference matching the emitted specifier', function () {
        const seeds = walkContent(
            'import { remote } from "pkg-b/remote.js";\nconsole.log(remote);',
            new Set([ 'index.ts::remote' ]),
            {
                indexed: indexedBundleWithFiles('pkg-b', [ 'wrong.js', 'remote.js' ]),
                moduleReferences: [
                    {
                        type: 'external-package',
                        packageName: 'pkg-b',
                        sourceSpecifier: 'pkg-b/remote.js',
                        emittedSpecifier: 'pkg-b/remote.js'
                    },
                    {
                        type: 'linked-code',
                        packageName: 'pkg-b',
                        sourceSpecifier: './wrong.js',
                        emittedSpecifier: 'pkg-b/wrong.js',
                        targetFilePath: 'wrong.js'
                    },
                    {
                        type: 'linked-code',
                        packageName: 'pkg-b',
                        sourceSpecifier: './remote.js',
                        emittedSpecifier: 'pkg-b/remote.js',
                        targetFilePath: 'remote.js'
                    }
                ]
            }
        );

        assert.deepStrictEqual(seeds.get('pkg-b'), new Set([ 'remote.js::remote' ]));
    });
});
