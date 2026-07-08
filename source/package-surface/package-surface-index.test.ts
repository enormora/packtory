import assert from 'node:assert';
import { suite, test } from 'mocha';
import { content, rootWithDeclaration, rootWithSource } from '../test-libraries/package-surface-fixtures.ts';
import type { BundleLike } from './package-shape.ts';
import {
    indexPublicModules,
    summarizePackageSurface,
    type PublicModuleIndex
} from './package-surface-index.ts';

const binsOnlyExplicitBundle: BundleLike = {
    name: 'package-a',
    roots: { cli: rootWithSource('/src/cli.js', 'cli.js') },
    contents: [],
    surface: {
        mode: 'explicit',
        packageInterface: { bins: [ { root: 'cli', name: 'package-a' } ] as const }
    }
};

function assertImplicitDuplicateMappings(index: PublicModuleIndex): void {
    assert.strictEqual(index.specifierBySourceFilePath.get('/src/index.js'), 'package-a');
    assert.strictEqual(index.specifierBySourceFilePath.get('/src/index.d.ts'), 'package-a');
    assert.strictEqual(index.specifierBySourceFilePath.get('/src/helper.d.ts'), 'package-a/helper.js');
    assert.strictEqual(index.specifierBySourceFilePath.get('/src/helper-copy.js'), 'package-a/helper.js');
    assert.strictEqual(index.specifierBySourceFilePath.get('/src/helper-second.js'), 'package-a/helper.js');
    assert.strictEqual(index.specifierBySourceFilePath.get('/src/feature.js'), 'package-a/feature.js');
    assert.strictEqual(index.sourceFilePathBySpecifier.get('package-a'), '/src/index.js');
    assert.strictEqual(index.sourceFilePathBySpecifier.get('package-a/helper.js'), '/src/helper-copy.js');
    assert.strictEqual(index.sourceFilePathBySpecifier.get('package-a/feature.js'), '/src/feature.js');
    assert.strictEqual(index.sourceFilePathBySpecifier.has('package-a/index.js'), false);
}

suite('package-surface-index', function () {
    suite('summary', function () {
        test('summarizePackageSurface returns every implicit root and the default representative root', function () {
            const summary = summarizePackageSurface({
                name: 'package-a',
                roots: {
                    main: rootWithSource('/src/index.js', 'index.js'),
                    worker: rootWithSource('/src/worker.js', 'worker.js')
                },
                surface: { mode: 'implicit', defaultModuleRoot: 'main' }
            });

            assert.partialDeepStrictEqual(summary, {
                publicRootIds: new Set([ 'main', 'worker' ]),
                representativeRootId: 'main'
            });
        });

        test('summarizePackageSurface returns explicit module and bin roots', function () {
            const summary = summarizePackageSurface({
                name: 'package-a',
                roots: {
                    main: rootWithSource('/src/index.js', 'index.js'),
                    cli: rootWithSource('/src/cli.js', 'cli.js')
                },
                surface: {
                    mode: 'explicit',
                    packageInterface: {
                        modules: [ { root: 'main', export: '.' } ],
                        bins: [ { root: 'cli', name: 'package-a' } ]
                    }
                }
            });

            assert.partialDeepStrictEqual(summary, {
                publicRootIds: new Set([ 'main', 'cli' ]),
                representativeRootId: 'main'
            });
        });

        test('summarizePackageSurface falls back to the first explicit bin root', function () {
            const summary = summarizePackageSurface(binsOnlyExplicitBundle);

            assert.partialDeepStrictEqual(summary, {
                publicRootIds: new Set([ 'cli' ]),
                representativeRootId: 'cli'
            });
        });

        test('summarizePackageSurface rejects explicit surfaces without public entries', function () {
            const invalidPackageInterface: Record<string, never> = {};

            assert.throws(function () {
                summarizePackageSurface({
                    name: 'package-a',
                    roots: { main: rootWithSource('/src/index.js', 'index.js') },
                    surface: {
                        mode: 'explicit',
                        packageInterface: invalidPackageInterface
                    }
                });
            }, /^Error: Package "package-a" explicit surface declares neither modules nor bins$/u);
        });

        test('summarizePackageSurface rejects explicit surfaces with empty bins', function () {
            assert.throws(function () {
                summarizePackageSurface({
                    name: 'package-a',
                    roots: { main: rootWithSource('/src/index.js', 'index.js') },
                    surface: {
                        mode: 'explicit',
                        packageInterface: { bins: [] as never }
                    }
                });
            }, /^Error: Package "package-a" explicit surface declares neither modules nor bins$/u);
        });

        test('summarizePackageSurface rejects unsupported surface modes', function () {
            const invalidBundle = {
                name: 'package-a',
                roots: { main: rootWithSource('/src/index.js', 'index.js') },
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
                    main: rootWithDeclaration('/src/index.js', 'index.js', '/src/index.d.ts', 'index.d.ts'),
                    feature: rootWithSource('/src/feature.js', 'feature.js')
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

            assert.strictEqual(index.specifierBySourceFilePath.get('/src/index.js'), 'package-a');
            assert.strictEqual(index.specifierBySourceFilePath.get('/src/index.d.ts'), 'package-a');
            assert.strictEqual(index.specifierBySourceFilePath.get('/src/feature.js'), 'package-a/feature');
            assert.strictEqual(index.sourceFilePathBySpecifier.get('package-a'), '/src/index.js');
            assert.strictEqual(index.sourceFilePathBySpecifier.get('package-a/feature'), '/src/feature.js');
        });

        test('indexPublicModules returns empty maps for explicit surfaces without modules', function () {
            const index = indexPublicModules(binsOnlyExplicitBundle);

            assert.partialDeepStrictEqual(index, {
                sourceFilePathBySpecifier: new Map(),
                specifierBySourceFilePath: new Map()
            });
        });

        test('indexPublicModules keeps implicit root mappings ahead of duplicate content mappings', function () {
            const index = indexPublicModules({
                name: 'package-a',
                roots: {
                    main: rootWithDeclaration('/src/index.js', 'index.js', '/src/index.d.ts', 'index.d.ts'),
                    helper: rootWithDeclaration('/src/helper.js', 'helper.js', '/src/helper.d.ts', 'helper.d.ts')
                },
                contents: [
                    content('/src/helper-copy.js', 'helper.js'),
                    content('/src/helper-second.js', 'helper.js'),
                    content('/src/feature.js', 'feature.js')
                ],
                surface: { mode: 'implicit', defaultModuleRoot: 'main' }
            });

            assertImplicitDuplicateMappings(index);
        });

        test('indexPublicModules keeps the first same-length explicit specifier', function () {
            const index = indexPublicModules({
                name: 'package-a',
                roots: { feature: rootWithSource('/src/feature.js', 'feature.js') },
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

            assert.strictEqual(index.specifierBySourceFilePath.get('/src/feature.js'), 'package-a/aa');
        });

        test('indexPublicModules keeps the first implicit specifier even when a later duplicate source path is shorter', function () {
            const index = indexPublicModules({
                name: 'package-a',
                roots: { main: rootWithSource('/src/index.js', 'index.js') },
                contents: [ content('/src/feature.js', 'feature-long.js'), content('/src/feature.js', 'f.js') ],
                surface: { mode: 'implicit', defaultModuleRoot: 'main' }
            });

            assert.strictEqual(index.specifierBySourceFilePath.get('/src/feature.js'), 'package-a/feature-long.js');
        });

        test('indexPublicModules rejects unsupported surface modes', function () {
            const invalidBundle = {
                name: 'package-a',
                roots: { main: rootWithSource('/src/index.js', 'index.js') },
                contents: [],
                surface: { mode: 'mystery' }
            };

            assert.throws(function () {
                indexPublicModules(invalidBundle as unknown as BundleLike);
            }, /^Error: Unsupported package surface mode: mystery$/u);
        });
    });
});
