import assert from 'node:assert';
import { suite, test } from 'mocha';
import { assertDeepSubset } from '../test-libraries/deep-subset-assertion.ts';
import { explicitPackageSurface, implicitPackageSurface } from '../package-surface/surface.ts';
import { analyzedBundleResource, linkedBundle } from '../test-libraries/bundle-fixtures.ts';
import type { BundleSubstitutionSource } from './linked-bundle.ts';
import {
    createPathReplacementLookup,
    type ImportPathReplacementRequest,
    type Replacements
} from './replacement-lookup.ts';

function targetFileDescription(
    inputFilePath: string,
    targetFilePath: string
): BundleSubstitutionSource['roots'][string]['js'] {
    return {
        inputFilePath,
        targetFilePath,
        content: '',
        isExecutable: false
    };
}

function declarationRoot(
    jsInputFilePath: string,
    jsTargetFilePath: string,
    declarationInputFilePath: string,
    declarationTargetFilePath: string
): BundleSubstitutionSource['roots'][string] {
    return {
        js: targetFileDescription(jsInputFilePath, jsTargetFilePath),
        declarationFile: targetFileDescription(declarationInputFilePath, declarationTargetFilePath)
    };
}

function peerEntryRoot(): BundleSubstitutionSource['roots'][string] {
    return declarationRoot('/b/entry.js', 'entry.js', '/b/entry.d.ts', 'entry.d.ts');
}

function peerDeclarationRoot(targetFilePath: string): BundleSubstitutionSource['roots'][string] {
    const stem = targetFilePath.replace(/\.js$/u, '');
    return declarationRoot(
        `/b/${targetFilePath}`,
        targetFilePath,
        `/b/${stem}.d.ts`,
        `${stem}.d.ts`
    );
}

function exposingBundle(name: string, inputFilePath: string, targetFilePath: string): BundleSubstitutionSource {
    const bundle = linkedBundle({
        name,
        contents: [ analyzedBundleResource(inputFilePath, { targetFilePath }) ],
        roots: {
            main: {
                js: targetFileDescription(inputFilePath, targetFilePath)
            }
        },
        surface: explicitPackageSurface({ modules: [ { root: 'main', export: '.' } ] })
    });
    return bundle;
}

function peerBundleWithEntryDeclaration(entryDeclarationContent: string): BundleSubstitutionSource {
    return linkedBundle({
        name: 'pkg-b',
        contents: [
            analyzedBundleResource('/b/entry.js', {
                targetFilePath: 'entry.js',
                directDependencies: new Set([ '/b/entry.d.ts' ])
            }),
            analyzedBundleResource('/b/entry.d.ts', {
                targetFilePath: 'entry.d.ts',
                content: entryDeclarationContent,
                directDependencies: new Set([ '/b/internal.d.ts' ])
            }),
            analyzedBundleResource('/b/internal.d.ts', { targetFilePath: 'internal.d.ts' })
        ],
        roots: {
            main: peerEntryRoot()
        },
        surface: explicitPackageSurface({ modules: [ { root: 'main', export: './entry.js' } ] })
    });
}

function peerBundleWithEntryJavaScriptExport(entryDeclarationContent: string): BundleSubstitutionSource {
    return linkedBundle({
        name: 'pkg-b',
        contents: [
            analyzedBundleResource('/b/entry.d.ts', {
                targetFilePath: 'entry.d.ts',
                content: entryDeclarationContent
            }),
            analyzedBundleResource('/b/internal.js', { targetFilePath: 'internal.js' })
        ],
        roots: {
            main: peerEntryRoot()
        },
        surface: explicitPackageSurface({ modules: [ { root: 'main', export: './entry.js' } ] })
    });
}

function peerBundleWithCircularDeclarations(): BundleSubstitutionSource {
    return linkedBundle({
        name: 'pkg-b',
        contents: [
            analyzedBundleResource('/b/entry.d.ts', {
                targetFilePath: 'entry.d.ts',
                content: 'export type { Internal } from "./internal.js";\n'
            }),
            analyzedBundleResource('/b/internal.d.ts', {
                targetFilePath: 'internal.d.ts',
                content: 'export type { Entry } from "./entry.js";\n'
            })
        ],
        roots: {
            main: peerEntryRoot()
        },
        surface: explicitPackageSurface({ modules: [ { root: 'main', export: './entry.js' } ] })
    });
}

function peerBundleWithDuplicateDeclarationExports(): BundleSubstitutionSource {
    return linkedBundle({
        name: 'pkg-b',
        contents: [
            analyzedBundleResource('/b/short.js', { targetFilePath: 'short.js' }),
            analyzedBundleResource('/b/short.d.ts', {
                targetFilePath: 'short.d.ts',
                content: 'export type { Internal } from "./internal.js";\n'
            }),
            analyzedBundleResource('/b/longer.js', { targetFilePath: 'longer.js' }),
            analyzedBundleResource('/b/longer.d.ts', {
                targetFilePath: 'longer.d.ts',
                content: 'export type { Internal } from "./internal.js";\n'
            }),
            analyzedBundleResource('/b/internal.d.ts', { targetFilePath: 'internal.d.ts' })
        ],
        roots: {
            short: peerDeclarationRoot('short.js'),
            longer: peerDeclarationRoot('longer.js')
        },
        surface: explicitPackageSurface({
            modules: [
                { root: 'longer', export: './longer/subpath.js' },
                { root: 'short', export: './short.js' }
            ]
        })
    });
}

function peerBundleWithEqualDeclarationExports(): BundleSubstitutionSource {
    return linkedBundle({
        name: 'pkg-b',
        contents: [
            analyzedBundleResource('/b/left.d.ts', {
                targetFilePath: 'left.d.ts',
                content: 'export type { Internal } from "./internal.js";\n'
            }),
            analyzedBundleResource('/b/right.d.ts', {
                targetFilePath: 'right.d.ts',
                content: 'export type { Internal } from "./internal.js";\n'
            }),
            analyzedBundleResource('/b/internal.d.ts', { targetFilePath: 'internal.d.ts' })
        ],
        roots: {
            left: peerDeclarationRoot('left.js'),
            right: peerDeclarationRoot('right.js')
        },
        surface: explicitPackageSurface({
            modules: [
                { root: 'left', export: './one.js' },
                { root: 'right', export: './two.js' }
            ]
        })
    });
}

function implicitPeerBundleWithFeatureDeclarationExport(): BundleSubstitutionSource {
    return linkedBundle({
        name: 'pkg-b',
        contents: [
            analyzedBundleResource('/b/index.js', { targetFilePath: 'index.js' }),
            analyzedBundleResource('/b/feature.js', { targetFilePath: 'feature.js' }),
            analyzedBundleResource('/b/feature.d.ts', {
                targetFilePath: 'feature.d.ts',
                content: 'export type { Internal } from "./internal.js";\n'
            }),
            analyzedBundleResource('/b/internal.d.ts', { targetFilePath: 'internal.d.ts' })
        ],
        roots: {
            main: {
                js: targetFileDescription('/b/index.js', 'index.js')
            },
            feature: peerDeclarationRoot('feature.js')
        },
        surface: implicitPackageSurface('main')
    });
}

function pathOnlyReplacementRequest(inputFilePath: string): ImportPathReplacementRequest {
    return {
        inputFilePath,
        requiredExportNames: new Set(),
        requiresNamespaceExport: false
    };
}

function dependencyAndPeerReplacements(
    bundle: BundleSubstitutionSource,
    inputFilePath: string
): readonly Replacements[] {
    const requests = [ pathOnlyReplacementRequest(inputFilePath) ];
    return [
        createPathReplacementLookup([ bundle ], [])(requests),
        createPathReplacementLookup([], [ bundle ])(requests)
    ];
}

function assertPeerDeclarationSpecifier(bundle: BundleSubstitutionSource, expectedSpecifier: string): Replacements {
    const result = createPathReplacementLookup([], [ bundle ])([ pathOnlyReplacementRequest('/b/internal.d.ts') ]);
    assert.deepStrictEqual(result.importPathReplacements.get('/b/internal.d.ts'), {
        emittedSpecifier: expectedSpecifier,
        packageName: 'pkg-b'
    });
    return result;
}

suite('replacement-lookup', function () {
    test('dependency lookup returns no replacements when no bundle owns any of the files', function () {
        const result = createPathReplacementLookup([], [])([ pathOnlyReplacementRequest('/x/a.ts') ]);

        assertDeepSubset(result, {
            importPathReplacements: {
                size: 0
            },
            bundleDependencies: []
        });
    });

    test('maps public targets and keeps results independent across reused dependency lookups', function () {
        const bundle = exposingBundle('pkg-b', '/b/helpers.ts', 'helpers.ts');
        const lookup = createPathReplacementLookup([ bundle ], []);
        const result = lookup([ pathOnlyReplacementRequest('/b/helpers.ts') ]);

        assert.deepStrictEqual(
            result.importPathReplacements.get('/b/helpers.ts'),
            { emittedSpecifier: 'pkg-b', packageName: 'pkg-b' }
        );
        assert.deepStrictEqual(result.bundleDependencies, [ 'pkg-b' ]);
        assert.deepStrictEqual(lookup([ pathOnlyReplacementRequest('/x/a.ts') ]), {
            importPathReplacements: new Map(),
            bundleDependencies: [],
            substitutedInputFilePathsByPackageName: new Map()
        });
    });

    suite('substitution promotion records', function () {
        test('dependency lookup maps declaration companions to the JavaScript package subpath', function () {
            const bundle = linkedBundle({
                name: 'pkg-b',
                contents: [
                    analyzedBundleResource('/b/helpers.js', { targetFilePath: 'helpers.js' }),
                    analyzedBundleResource('/b/helpers.d.ts', { targetFilePath: 'helpers.d.ts' })
                ]
            });

            for (const result of dependencyAndPeerReplacements(bundle, '/b/helpers.d.ts')) {
                assert.deepStrictEqual({
                    replacement: result.importPathReplacements.get('/b/helpers.d.ts'),
                    bundleDependencies: result.bundleDependencies,
                    substitutedInputFilePathsByPackageName: result.substitutedInputFilePathsByPackageName
                }, {
                    replacement: { emittedSpecifier: 'pkg-b/helpers.js', packageName: 'pkg-b' },
                    bundleDependencies: [ 'pkg-b' ],
                    substitutedInputFilePathsByPackageName: new Map([
                        [ 'pkg-b', new Set([ '/b/helpers.js', '/b/helpers.d.ts' ]) ]
                    ])
                });
            }
        });

        test('dependency lookup does not record non-code substitutions for promotion', function () {
            const bundle = exposingBundle('pkg-b', '/b/data.json', 'data.json');

            const result = createPathReplacementLookup([ bundle ], [])([ pathOnlyReplacementRequest('/b/data.json') ]);

            assert.deepStrictEqual({
                replacement: result.importPathReplacements.get('/b/data.json'),
                substitutedInputFilePathsByPackageName: result.substitutedInputFilePathsByPackageName
            }, {
                replacement: { emittedSpecifier: 'pkg-b', packageName: 'pkg-b' },
                substitutedInputFilePathsByPackageName: new Map()
            });
        });

        test('dependency lookup records JavaScript substitutions from public roots', function () {
            const bundle = linkedBundle({
                name: 'pkg-b',
                contents: [],
                roots: {
                    main: {
                        js: targetFileDescription('/b/public.js', 'public.js')
                    }
                },
                surface: explicitPackageSurface({ modules: [ { root: 'main', export: '.' } ] })
            });

            const result = createPathReplacementLookup([ bundle ], [])([ pathOnlyReplacementRequest('/b/public.js') ]);

            assert.deepStrictEqual(
                result.substitutedInputFilePathsByPackageName,
                new Map([
                    [ 'pkg-b', new Set([ '/b/public.js' ]) ]
                ])
            );
        });

        test('dependency lookup records declaration-only substitutions for promotion', function () {
            const bundle = linkedBundle({
                name: 'pkg-b',
                contents: [
                    analyzedBundleResource('/b/types.d.ts', { targetFilePath: 'types.d.ts' })
                ]
            });

            for (const result of dependencyAndPeerReplacements(bundle, '/b/types.d.ts')) {
                assert.deepStrictEqual({
                    replacement: result.importPathReplacements.get('/b/types.d.ts'),
                    substitutedInputFilePathsByPackageName: result.substitutedInputFilePathsByPackageName
                }, {
                    replacement: { emittedSpecifier: 'pkg-b/types.d.ts', packageName: 'pkg-b' },
                    substitutedInputFilePathsByPackageName: new Map([
                        [ 'pkg-b', new Set([ '/b/types.d.ts' ]) ]
                    ])
                });
            }
        });
    });

    test('dependency lookup retains private files without requesting extra exports', function () {
        const bundle = linkedBundle({
            name: 'pkg-b',
            contents: [ analyzedBundleResource('/b/internal.ts', { targetFilePath: 'internal.ts' }) ],
            surface: explicitPackageSurface({ modules: [ { root: 'main', export: '.' } ] })
        });

        const result = createPathReplacementLookup([ bundle ], [])([ pathOnlyReplacementRequest('/b/internal.ts') ]);

        assert.deepStrictEqual(result, {
            importPathReplacements: new Map(),
            bundleDependencies: [],
            substitutedInputFilePathsByPackageName: new Map()
        });
    });

    test('dependency lookup ignores owned source maps that are not exposed', function () {
        const bundle = linkedBundle({
            name: 'pkg-b',
            contents: [ analyzedBundleResource('/b/index.js.map', { targetFilePath: 'index.js.map' }) ],
            surface: explicitPackageSurface({ modules: [ { root: 'main', export: '.' } ] })
        });

        const result = createPathReplacementLookup([], [ bundle ])([ pathOnlyReplacementRequest('/b/index.js.map') ]);

        assert.strictEqual(result.importPathReplacements.has('/b/index.js.map'), false);
    });

    test('dependency lookup returns one bundle dependency entry per matched file', function () {
        const bundleB = exposingBundle('pkg-b', '/b/helpers.ts', 'helpers.ts');
        const bundleC = exposingBundle('pkg-c', '/c/helpers.ts', 'helpers.ts');

        const result = createPathReplacementLookup([ bundleB, bundleC ], [])([
            pathOnlyReplacementRequest('/b/helpers.ts'),
            pathOnlyReplacementRequest('/c/helpers.ts')
        ]);

        assert.deepStrictEqual(result.bundleDependencies, [ 'pkg-b', 'pkg-c' ]);
    });

    suite('peer dependency exports', function () {
        test('dependency lookup maps peer internals to a reachable exported module', function () {
            const content = [
                "export * as types from './internal.js';",
                "export type { External } from 'external-package';"
            ]
                .join(
                    '\n'
                );
            const bundle = peerBundleWithEntryDeclaration(content);

            const result = assertPeerDeclarationSpecifier(bundle, 'pkg-b/entry.js');
            assert.deepStrictEqual(result.bundleDependencies, [ 'pkg-b' ]);
        });

        test('dependency lookup maps peer internals through named declaration exports', function () {
            const content = [
                'export type { Internal } from "./internal.js";',
                'export type { External } from "external-package";'
            ]
                .join(
                    '\n'
                );
            const bundle = peerBundleWithEntryDeclaration(content);

            assertPeerDeclarationSpecifier(bundle, 'pkg-b/entry.js');
        });

        test('dependency lookup maps peer internals through JavaScript declaration exports', function () {
            const bundle = peerBundleWithEntryJavaScriptExport(
                'export { internal } from "./internal.js";\n'
            );

            const result = createPathReplacementLookup([], [ bundle ])([
                pathOnlyReplacementRequest('/b/internal.js')
            ]);

            assert.deepStrictEqual(
                result.importPathReplacements.get('/b/internal.js'),
                { emittedSpecifier: 'pkg-b/entry.js', packageName: 'pkg-b' }
            );
        });
    });

    suite('peer dependency rejections', function () {
        test('dependency lookup rejects peer internals reached only by a non-relative export', function () {
            const bundle = peerBundleWithEntryDeclaration(
                'export type { Internal } from "internal.d.ts";\n'
            );

            assert.throws(function () {
                createPathReplacementLookup([], [ bundle ])([ pathOnlyReplacementRequest('/b/internal.d.ts') ]);
            }, /^Error: Package "pkg-b" does not expose "\/b\/internal\.d\.ts" for cross-package substitution$/u);
        });

        test('dependency lookup rejects peer internals reached only by an import', function () {
            const bundle = peerBundleWithEntryDeclaration(
                'import "./internal.js";\n'
            );

            assert.throws(function () {
                createPathReplacementLookup([], [ bundle ])([ pathOnlyReplacementRequest('/b/internal.d.ts') ]);
            }, /^Error: Package "pkg-b" does not expose "\/b\/internal\.d\.ts" for cross-package substitution$/u);
        });

        test('dependency lookup rejects peer internals reached only by a local export', function () {
            const bundle = peerBundleWithEntryDeclaration(
                'export type { Internal };\n'
            );

            assert.throws(function () {
                createPathReplacementLookup([], [ bundle ])([ pathOnlyReplacementRequest('/b/internal.d.ts') ]);
            }, /^Error: Package "pkg-b" does not expose "\/b\/internal\.d\.ts" for cross-package substitution$/u);
        });
    });

    suite('peer dependency traversal', function () {
        test('dependency lookup tolerates circular peer declaration exports', function () {
            const bundle = peerBundleWithCircularDeclarations();

            assertPeerDeclarationSpecifier(bundle, 'pkg-b/entry.js');
        });

        test('dependency lookup keeps the shortest peer module that reaches an internal declaration', function () {
            const bundle = peerBundleWithDuplicateDeclarationExports();

            assertPeerDeclarationSpecifier(bundle, 'pkg-b/short.js');
        });

        test('dependency lookup keeps the first peer module when reachable specifiers tie', function () {
            const bundle = peerBundleWithEqualDeclarationExports();

            assertPeerDeclarationSpecifier(bundle, 'pkg-b/one.js');
        });

        test('dependency lookup maps implicit peer internals through secondary roots', function () {
            const bundle = implicitPeerBundleWithFeatureDeclarationExport();

            assertPeerDeclarationSpecifier(bundle, 'pkg-b/feature.js');
        });
    });

    suite('peer dependency hidden internals', function () {
        test('dependency lookup ignores unrelated files when peer bundles contain private files', function () {
            const bundle = linkedBundle({
                name: 'pkg-b',
                contents: [ analyzedBundleResource('/b/internal.js', { targetFilePath: 'internal.js' }) ],
                surface: explicitPackageSurface({ modules: [ { root: 'main', export: '.' } ] })
            });

            const result = createPathReplacementLookup([], [ bundle ])([ pathOnlyReplacementRequest('/a/local.js') ]);

            assert.deepStrictEqual(result, {
                importPathReplacements: new Map(),
                bundleDependencies: [],
                substitutedInputFilePathsByPackageName: new Map()
            });
        });

        test('dependency lookup rejects explicit peer internals when the surface exposes no modules', function () {
            const bundle = linkedBundle({
                name: 'pkg-b',
                contents: [ analyzedBundleResource('/b/internal.js', { targetFilePath: 'internal.js' }) ],
                roots: {
                    main: {
                        js: targetFileDescription('/b/entry.js', 'entry.js')
                    }
                },
                surface: explicitPackageSurface({ bins: [ { root: 'main', name: 'pkg-b' } ] })
            });

            assert.throws(function () {
                createPathReplacementLookup([], [ bundle ])([ pathOnlyReplacementRequest('/b/internal.js') ]);
            }, /^Error: Package "pkg-b" does not expose "\/b\/internal\.js" for cross-package substitution$/u);
        });

        test('dependency lookup rejects peer internals that no exported module reaches', function () {
            const bundle = peerBundleWithEntryDeclaration(
                "export declare const value: import('./internal.js').Internal;\n"
            );

            try {
                createPathReplacementLookup([], [ bundle ])([ pathOnlyReplacementRequest('/b/internal.d.ts') ]);
                assert.fail('expected dependency lookup to throw');
            } catch (error) {
                assert.ok(error instanceof Error);
                assert.strictEqual(
                    error.message,
                    'Package "pkg-b" does not expose "/b/internal.d.ts" for cross-package substitution'
                );
            }
        });
    });
});
