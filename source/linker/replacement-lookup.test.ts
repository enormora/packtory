import assert from 'node:assert';
import { suite, test } from 'mocha';
import { assertDeepSubset } from '../test-libraries/deep-subset-assertion.ts';
import { explicitPackageSurface, implicitPackageSurface } from '../package-surface/surface.ts';
import { analyzedBundleResource, linkedBundle } from '../test-libraries/bundle-fixtures.ts';
import type { BundleSubstitutionSource } from './linked-bundle.ts';
import { findAllPathReplacements, type ImportPathReplacementRequest } from './replacement-lookup.ts';

function targetFileDescription(
    sourceFilePath: string,
    targetFilePath: string
): BundleSubstitutionSource['roots'][string]['js'] {
    return {
        sourceFilePath,
        targetFilePath,
        content: '',
        isExecutable: false
    };
}

function declarationRoot(
    jsSourceFilePath: string,
    jsTargetFilePath: string,
    declarationSourceFilePath: string,
    declarationTargetFilePath: string
): BundleSubstitutionSource['roots'][string] {
    return {
        js: targetFileDescription(jsSourceFilePath, jsTargetFilePath),
        declarationFile: targetFileDescription(declarationSourceFilePath, declarationTargetFilePath)
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

function exposingBundle(name: string, sourceFilePath: string, targetFilePath: string): BundleSubstitutionSource {
    const bundle = linkedBundle({
        name,
        contents: [ analyzedBundleResource(sourceFilePath, { targetFilePath }) ],
        roots: {
            main: {
                js: targetFileDescription(sourceFilePath, targetFilePath)
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

function pathOnlyReplacementRequest(sourceFilePath: string): ImportPathReplacementRequest {
    return {
        sourceFilePath,
        requiredExportNames: new Set(),
        requiresNamespaceExport: false
    };
}

suite('replacement-lookup', function () {
    test('findAllPathReplacements returns no replacements when no bundle owns any of the files', function () {
        const result = findAllPathReplacements([ pathOnlyReplacementRequest('/x/a.ts') ], [], []);

        assertDeepSubset(result, {
            importPathReplacements: {
                size: 0
            },
            bundleDependencies: []
        });
    });

    test('findAllPathReplacements maps each file to the public target path of the owning bundle', function () {
        const bundle = exposingBundle('pkg-b', '/b/helpers.ts', 'helpers.ts');

        const result = findAllPathReplacements([ pathOnlyReplacementRequest('/b/helpers.ts') ], [ bundle ], []);

        assert.deepStrictEqual(
            result.importPathReplacements.get('/b/helpers.ts'),
            { emittedSpecifier: 'pkg-b', packageName: 'pkg-b' }
        );
        assert.deepStrictEqual(result.bundleDependencies, [ 'pkg-b' ]);
    });

    test('findAllPathReplacements maps declaration companions to the JavaScript package subpath', function () {
        const bundle = linkedBundle({
            name: 'pkg-b',
            contents: [
                analyzedBundleResource('/b/helpers.js', { targetFilePath: 'helpers.js' }),
                analyzedBundleResource('/b/helpers.d.ts', { targetFilePath: 'helpers.d.ts' })
            ]
        });

        const result = findAllPathReplacements([ pathOnlyReplacementRequest('/b/helpers.d.ts') ], [ bundle ], []);

        assert.deepStrictEqual({
            replacement: result.importPathReplacements.get('/b/helpers.d.ts'),
            bundleDependencies: result.bundleDependencies,
            substitutedSourceFilePathsByPackageName: result.substitutedSourceFilePathsByPackageName
        }, {
            replacement: { emittedSpecifier: 'pkg-b/helpers.js', packageName: 'pkg-b' },
            bundleDependencies: [ 'pkg-b' ],
            substitutedSourceFilePathsByPackageName: new Map([
                [ 'pkg-b', new Set([ '/b/helpers.js', '/b/helpers.d.ts' ]) ]
            ])
        });
    });

    test('findAllPathReplacements throws when a bundle owns the file but does not expose it', function () {
        const bundle = linkedBundle({
            name: 'pkg-b',
            contents: [ analyzedBundleResource('/b/internal.ts', { targetFilePath: 'internal.ts' }) ],
            surface: explicitPackageSurface({ modules: [ { root: 'main', export: '.' } ] })
        });

        try {
            findAllPathReplacements([ pathOnlyReplacementRequest('/b/internal.ts') ], [ bundle ], []);
            assert.fail('expected findAllPathReplacements to throw');
        } catch (error) {
            assert.ok(error instanceof Error);
            assert.strictEqual(
                error.message,
                'Package "pkg-b" does not expose "/b/internal.ts" for cross-package substitution'
            );
        }
    });

    test('findAllPathReplacements ignores owned source maps that are not exposed', function () {
        const bundle = linkedBundle({
            name: 'pkg-b',
            contents: [ analyzedBundleResource('/b/index.js.map', { targetFilePath: 'index.js.map' }) ],
            surface: explicitPackageSurface({ modules: [ { root: 'main', export: '.' } ] })
        });

        const result = findAllPathReplacements([ pathOnlyReplacementRequest('/b/index.js.map') ], [ bundle ], []);

        assert.strictEqual(result.importPathReplacements.has('/b/index.js.map'), false);
    });

    test('findAllPathReplacements returns one bundle dependency entry per matched file', function () {
        const bundleB = exposingBundle('pkg-b', '/b/helpers.ts', 'helpers.ts');
        const bundleC = exposingBundle('pkg-c', '/c/helpers.ts', 'helpers.ts');

        const result = findAllPathReplacements(
            [ pathOnlyReplacementRequest('/b/helpers.ts'), pathOnlyReplacementRequest('/c/helpers.ts') ],
            [ bundleB, bundleC ],
            []
        );

        assert.deepStrictEqual(result.bundleDependencies, [ 'pkg-b', 'pkg-c' ]);
    });

    suite('peer dependency exports', function () {
        test('findAllPathReplacements maps peer internals to a reachable exported module', function () {
            const content = [
                "export * as types from './internal.js';",
                "export type { External } from 'external-package';"
            ]
                .join(
                    '\n'
                );
            const bundle = peerBundleWithEntryDeclaration(content);

            const result = findAllPathReplacements([ pathOnlyReplacementRequest('/b/internal.d.ts') ], [], [ bundle ]);

            assert.deepStrictEqual(
                result.importPathReplacements.get('/b/internal.d.ts'),
                { emittedSpecifier: 'pkg-b/entry.js', packageName: 'pkg-b' }
            );
            assert.deepStrictEqual(result.bundleDependencies, [ 'pkg-b' ]);
        });

        test('findAllPathReplacements maps peer internals through named declaration exports', function () {
            const content = [
                'export type { Internal } from "./internal.js";',
                'export type { External } from "external-package";'
            ]
                .join(
                    '\n'
                );
            const bundle = peerBundleWithEntryDeclaration(content);

            const result = findAllPathReplacements([ pathOnlyReplacementRequest('/b/internal.d.ts') ], [], [ bundle ]);

            assert.deepStrictEqual(
                result.importPathReplacements.get('/b/internal.d.ts'),
                { emittedSpecifier: 'pkg-b/entry.js', packageName: 'pkg-b' }
            );
        });

        test('findAllPathReplacements maps peer internals through JavaScript declaration exports', function () {
            const bundle = peerBundleWithEntryJavaScriptExport(
                'export { internal } from "./internal.js";\n'
            );

            const result = findAllPathReplacements([ pathOnlyReplacementRequest('/b/internal.js') ], [], [ bundle ]);

            assert.deepStrictEqual(
                result.importPathReplacements.get('/b/internal.js'),
                { emittedSpecifier: 'pkg-b/entry.js', packageName: 'pkg-b' }
            );
        });
    });

    suite('peer dependency rejections', function () {
        test('findAllPathReplacements rejects peer internals reached only by a non-relative export', function () {
            const bundle = peerBundleWithEntryDeclaration(
                'export type { Internal } from "internal.d.ts";\n'
            );

            assert.throws(function () {
                findAllPathReplacements([ pathOnlyReplacementRequest('/b/internal.d.ts') ], [], [ bundle ]);
            }, /^Error: Package "pkg-b" does not expose "\/b\/internal\.d\.ts" for cross-package substitution$/u);
        });

        test('findAllPathReplacements rejects peer internals reached only by an import', function () {
            const bundle = peerBundleWithEntryDeclaration(
                'import "./internal.js";\n'
            );

            assert.throws(function () {
                findAllPathReplacements([ pathOnlyReplacementRequest('/b/internal.d.ts') ], [], [ bundle ]);
            }, /^Error: Package "pkg-b" does not expose "\/b\/internal\.d\.ts" for cross-package substitution$/u);
        });

        test('findAllPathReplacements rejects peer internals reached only by a local export', function () {
            const bundle = peerBundleWithEntryDeclaration(
                'export type { Internal };\n'
            );

            assert.throws(function () {
                findAllPathReplacements([ pathOnlyReplacementRequest('/b/internal.d.ts') ], [], [ bundle ]);
            }, /^Error: Package "pkg-b" does not expose "\/b\/internal\.d\.ts" for cross-package substitution$/u);
        });
    });

    suite('peer dependency traversal', function () {
        test('findAllPathReplacements tolerates circular peer declaration exports', function () {
            const bundle = peerBundleWithCircularDeclarations();

            const result = findAllPathReplacements([ pathOnlyReplacementRequest('/b/internal.d.ts') ], [], [ bundle ]);

            assert.deepStrictEqual(
                result.importPathReplacements.get('/b/internal.d.ts'),
                { emittedSpecifier: 'pkg-b/entry.js', packageName: 'pkg-b' }
            );
        });

        test('findAllPathReplacements keeps the shortest peer module that reaches an internal declaration', function () {
            const bundle = peerBundleWithDuplicateDeclarationExports();

            const result = findAllPathReplacements([ pathOnlyReplacementRequest('/b/internal.d.ts') ], [], [ bundle ]);

            assert.deepStrictEqual(
                result.importPathReplacements.get('/b/internal.d.ts'),
                { emittedSpecifier: 'pkg-b/short.js', packageName: 'pkg-b' }
            );
        });

        test('findAllPathReplacements keeps the first peer module when reachable specifiers tie', function () {
            const bundle = peerBundleWithEqualDeclarationExports();

            const result = findAllPathReplacements([ pathOnlyReplacementRequest('/b/internal.d.ts') ], [], [ bundle ]);

            assert.deepStrictEqual(
                result.importPathReplacements.get('/b/internal.d.ts'),
                { emittedSpecifier: 'pkg-b/one.js', packageName: 'pkg-b' }
            );
        });

        test('findAllPathReplacements maps implicit peer internals through secondary roots', function () {
            const bundle = implicitPeerBundleWithFeatureDeclarationExport();

            const result = findAllPathReplacements([ pathOnlyReplacementRequest('/b/internal.d.ts') ], [], [ bundle ]);

            assert.deepStrictEqual(
                result.importPathReplacements.get('/b/internal.d.ts'),
                { emittedSpecifier: 'pkg-b/feature.js', packageName: 'pkg-b' }
            );
        });
    });

    suite('peer dependency hidden internals', function () {
        test('findAllPathReplacements rejects explicit peer internals when the surface exposes no modules', function () {
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
                findAllPathReplacements([ pathOnlyReplacementRequest('/b/internal.js') ], [], [ bundle ]);
            }, /^Error: Package "pkg-b" does not expose "\/b\/internal\.js" for cross-package substitution$/u);
        });

        test('findAllPathReplacements rejects peer internals that no exported module reaches', function () {
            const bundle = peerBundleWithEntryDeclaration(
                "export declare const value: import('./internal.js').Internal;\n"
            );

            try {
                findAllPathReplacements([ pathOnlyReplacementRequest('/b/internal.d.ts') ], [], [ bundle ]);
                assert.fail('expected findAllPathReplacements to throw');
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
