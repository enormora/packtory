import assert from 'node:assert';
import { suite, test } from 'mocha';
import { content, rootWithDeclaration, rootWithSource } from '../test-libraries/package-surface-fixtures.ts';
import type { BundleLike } from './package-shape.ts';
import {
    indexPublicModules,
    summarizePackageSurface,
    type PublicModuleIndex
} from './package-surface-index.ts';

const executablesOnlyExplicitBundle: BundleLike = {
    name: 'package-a',
    roots: { commandLineInterface: rootWithSource('/source/cli.js', 'cli.js') },
    contents: [],
    surface: {
        mode: 'explicit',
        packageInterface: { executables: [ { root: 'commandLineInterface', name: 'package-a' } ] as const }
    }
};

function assertImplicitDuplicateMappings(index: PublicModuleIndex): void {
    assert.strictEqual(index.specifierByInputFilePath.get('/source/index.js'), 'package-a');
    assert.strictEqual(index.specifierByInputFilePath.get('/source/index.d.ts'), 'package-a');
    assert.strictEqual(index.specifierByInputFilePath.get('/source/helper.d.ts'), 'package-a/helper.js');
    assert.strictEqual(index.specifierByInputFilePath.get('/source/helper-copy.js'), 'package-a/helper.js');
    assert.strictEqual(index.specifierByInputFilePath.get('/source/helper-second.js'), 'package-a/helper.js');
    assert.strictEqual(index.specifierByInputFilePath.get('/source/feature.js'), 'package-a/feature.js');
    assert.strictEqual(index.inputFilePathBySpecifier.get('package-a'), '/source/index.js');
    assert.strictEqual(index.inputFilePathBySpecifier.get('package-a/helper.js'), '/source/helper.js');
    assert.strictEqual(index.inputFilePathBySpecifier.get('package-a/feature.js'), '/source/feature.js');
    assert.strictEqual(index.inputFilePathBySpecifier.has('package-a/index.js'), false);
}

suite('package-surface-index', function () {
    suite('summary', function () {
        test('summarizePackageSurface returns every implicit root and the default representative root', function () {
            const summary = summarizePackageSurface({
                name: 'package-a',
                roots: {
                    main: rootWithSource('/source/index.js', 'index.js'),
                    worker: rootWithSource('/source/worker.js', 'worker.js')
                },
                surface: { mode: 'implicit', defaultModuleRoot: 'main' }
            });

            assert.partialDeepStrictEqual(summary, {
                publicRootIdentifiers: new Set([ 'main', 'worker' ]),
                representativeRootIdentifier: 'main'
            });
        });

        test('summarizePackageSurface returns explicit module and bin roots', function () {
            const summary = summarizePackageSurface({
                name: 'package-a',
                roots: {
                    main: rootWithSource('/source/index.js', 'index.js'),
                    commandLineInterface: rootWithSource('/source/cli.js', 'cli.js')
                },
                surface: {
                    mode: 'explicit',
                    packageInterface: {
                        modules: [ { root: 'main', export: '.' } ],
                        executables: [ { root: 'commandLineInterface', name: 'package-a' } ]
                    }
                }
            });

            assert.partialDeepStrictEqual(summary, {
                publicRootIdentifiers: new Set([ 'main', 'commandLineInterface' ]),
                representativeRootIdentifier: 'main'
            });
        });

        test('summarizePackageSurface falls back to the first explicit bin root', function () {
            const summary = summarizePackageSurface(executablesOnlyExplicitBundle);

            assert.partialDeepStrictEqual(summary, {
                publicRootIdentifiers: new Set([ 'commandLineInterface' ]),
                representativeRootIdentifier: 'commandLineInterface'
            });
        });

        test('summarizePackageSurface rejects explicit surfaces without public entries', function () {
            const invalidPackageInterface: Record<string, never> = {};

            assert.throws(function () {
                summarizePackageSurface({
                    name: 'package-a',
                    roots: { main: rootWithSource('/source/index.js', 'index.js') },
                    surface: {
                        mode: 'explicit',
                        packageInterface: invalidPackageInterface
                    }
                });
            }, /^Error: Package "package-a" explicit surface declares neither modules nor executables$/u);
        });

        test('summarizePackageSurface rejects explicit surfaces with empty executables', function () {
            assert.throws(function () {
                summarizePackageSurface({
                    name: 'package-a',
                    roots: { main: rootWithSource('/source/index.js', 'index.js') },
                    surface: {
                        mode: 'explicit',
                        packageInterface: { executables: [] as never }
                    }
                });
            }, /^Error: Package "package-a" explicit surface declares neither modules nor executables$/u);
        });

        test('summarizePackageSurface falls back to executables when the module list is empty', function () {
            const summary = summarizePackageSurface({
                ...executablesOnlyExplicitBundle,
                surface: {
                    mode: 'explicit',
                    packageInterface: {
                        modules: [] as never,
                        executables: [ { root: 'commandLineInterface', name: 'package-a' } ]
                    }
                }
            });

            assert.deepStrictEqual(summary, {
                publicRootIdentifiers: new Set([ 'commandLineInterface' ]),
                representativeRootIdentifier: 'commandLineInterface'
            });
        });

        test('summarizePackageSurface rejects unsupported surface modes', function () {
            const invalidBundle = {
                name: 'package-a',
                roots: { main: rootWithSource('/source/index.js', 'index.js') },
                contents: [],
                surface: { mode: 'mystery' }
            };

            assert.throws(function () {
                summarizePackageSurface(invalidBundle as never);
            }, /^Error: Unsupported package surface mode: mystery$/u);
        });
    });

    suite('public module index', function () {
        test('indexPublicModules prefers the shortest explicit specifier and keeps declaration aliases', function () {
            const index = indexPublicModules({
                name: 'package-a',
                roots: {
                    main: rootWithDeclaration('/source/index.js', 'index.js', '/source/index.d.ts', 'index.d.ts'),
                    feature: rootWithSource('/source/feature.js', 'feature.js')
                },
                contents: [],
                surface: {
                    mode: 'explicit',
                    packageInterface: {
                        modules: [
                            { root: 'main', export: './long-entry' },
                            { root: 'main', export: '.' },
                            { root: 'feature', export: './feature' }
                        ]
                    }
                }
            });

            assert.strictEqual(index.specifierByInputFilePath.get('/source/index.js'), 'package-a');
            assert.strictEqual(index.specifierByInputFilePath.get('/source/index.d.ts'), 'package-a');
            assert.strictEqual(index.specifierByInputFilePath.get('/source/feature.js'), 'package-a/feature');
            assert.strictEqual(index.inputFilePathBySpecifier.get('package-a'), '/source/index.js');
            assert.strictEqual(index.inputFilePathBySpecifier.get('package-a/feature'), '/source/feature.js');
        });

        test('indexPublicModules returns empty maps for explicit surfaces without modules', function () {
            const index = indexPublicModules(executablesOnlyExplicitBundle);

            assert.partialDeepStrictEqual(index, {
                inputFilePathBySpecifier: new Map(),
                specifierByInputFilePath: new Map()
            });
        });

        test('indexPublicModules keeps implicit root mappings ahead of duplicate content mappings', function () {
            const index = indexPublicModules({
                name: 'package-a',
                roots: {
                    main: rootWithDeclaration('/source/index.js', 'index.js', '/source/index.d.ts', 'index.d.ts'),
                    helper: rootWithDeclaration('/source/helper.js', 'helper.js', '/source/helper.d.ts', 'helper.d.ts')
                },
                contents: [
                    content('/source/helper-copy.js', 'helper.js'),
                    content('/source/helper-second.js', 'helper.js'),
                    content('/source/feature.js', 'feature.js')
                ],
                surface: { mode: 'implicit', defaultModuleRoot: 'main' }
            });

            assertImplicitDuplicateMappings(index);
        });

        test('indexPublicModules maps declaration companions to their JavaScript package specifier', function () {
            const index = indexPublicModules({
                name: 'package-a',
                roots: { main: rootWithSource('/source/index.js', 'index.js') },
                contents: [
                    content('/source/feature.d.ts', 'feature.d.ts'),
                    content('/source/feature.js', 'feature.js'),
                    content('/source/types.d.ts', 'types.d.ts')
                ],
                surface: { mode: 'implicit', defaultModuleRoot: 'main' }
            });

            assert.strictEqual(index.specifierByInputFilePath.get('/source/feature.d.ts'), 'package-a/feature.js');
            assert.strictEqual(index.specifierByInputFilePath.get('/source/types.d.ts'), 'package-a/types.d.ts');
            assert.strictEqual(index.inputFilePathBySpecifier.get('package-a/feature.js'), '/source/feature.js');
        });

        test('indexPublicModules keeps the first same-length explicit specifier', function () {
            const index = indexPublicModules({
                name: 'package-a',
                roots: { feature: rootWithSource('/source/feature.js', 'feature.js') },
                contents: [],
                surface: {
                    mode: 'explicit',
                    packageInterface: {
                        modules: [
                            { root: 'feature', export: './aa' },
                            { root: 'feature', export: './bb' }
                        ]
                    }
                }
            });

            assert.strictEqual(index.specifierByInputFilePath.get('/source/feature.js'), 'package-a/aa');
        });

        test('indexPublicModules keeps the first implicit specifier even when a later duplicate source path is shorter', function () {
            const index = indexPublicModules({
                name: 'package-a',
                roots: { main: rootWithSource('/source/index.js', 'index.js') },
                contents: [ content('/source/feature.js', 'feature-long.js'), content('/source/feature.js', 'f.js') ],
                surface: { mode: 'implicit', defaultModuleRoot: 'main' }
            });

            assert.strictEqual(index.specifierByInputFilePath.get('/source/feature.js'), 'package-a/feature-long.js');
        });

        test('indexPublicModules rejects unsupported surface modes', function () {
            const invalidBundle = {
                name: 'package-a',
                roots: { main: rootWithSource('/source/index.js', 'index.js') },
                contents: [],
                surface: { mode: 'mystery' }
            };

            assert.throws(function () {
                indexPublicModules(invalidBundle as unknown as BundleLike);
            }, /^Error: Unsupported package surface mode: mystery$/u);
        });
    });
});
