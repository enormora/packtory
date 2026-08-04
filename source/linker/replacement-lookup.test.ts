import assert from 'node:assert';
import { suite, test } from 'mocha';
import { assertDeepSubset } from '../test-libraries/deep-subset-assertion.ts';
import { explicitPackageSurface } from '../package-surface/surface.ts';
import { analyzedBundleResource, linkedBundle } from '../test-libraries/bundle-fixtures.ts';
import type { BundleSubstitutionSource } from './linked-bundle.ts';
import { findAllPathReplacements } from './replacement-lookup.ts';

function exposingBundle(name: string, sourceFilePath: string, targetFilePath: string): BundleSubstitutionSource {
    const bundle = linkedBundle({
        name,
        contents: [ analyzedBundleResource(sourceFilePath, { targetFilePath }) ],
        roots: {
            main: {
                js: { sourceFilePath, targetFilePath, content: '', isExecutable: false }
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
            main: {
                js: {
                    sourceFilePath: '/b/entry.js',
                    targetFilePath: 'entry.js',
                    content: '',
                    isExecutable: false
                },
                declarationFile: {
                    sourceFilePath: '/b/entry.d.ts',
                    targetFilePath: 'entry.d.ts',
                    content: '',
                    isExecutable: false
                }
            }
        },
        surface: explicitPackageSurface({ modules: [ { root: 'main', export: './entry.js' } ] })
    });
}

suite('replacement-lookup', function () {
    test('findAllPathReplacements returns no replacements when no bundle owns any of the files', function () {
        const result = findAllPathReplacements([ '/x/a.ts' ], [], []);

        assertDeepSubset(result, {
            importPathReplacements: {
                size: 0
            },
            bundleDependencies: []
        });
    });

    test('findAllPathReplacements maps each file to the public target path of the owning bundle', function () {
        const bundle = exposingBundle('pkg-b', '/b/helpers.ts', 'helpers.ts');

        const result = findAllPathReplacements([ '/b/helpers.ts' ], [ bundle ], []);

        assert.strictEqual(result.importPathReplacements.get('/b/helpers.ts'), 'pkg-b');
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

        const result = findAllPathReplacements([ '/b/helpers.d.ts' ], [ bundle ], []);

        assert.strictEqual(result.importPathReplacements.get('/b/helpers.d.ts'), 'pkg-b/helpers.js');
        assert.deepStrictEqual(result.bundleDependencies, [ 'pkg-b' ]);
    });

    test('findAllPathReplacements throws when a bundle owns the file but does not expose it', function () {
        const bundle = linkedBundle({
            name: 'pkg-b',
            contents: [ analyzedBundleResource('/b/internal.ts', { targetFilePath: 'internal.ts' }) ],
            surface: explicitPackageSurface({ modules: [ { root: 'main', export: '.' } ] })
        });

        try {
            findAllPathReplacements([ '/b/internal.ts' ], [ bundle ], []);
            assert.fail('expected findAllPathReplacements to throw');
        } catch (error) {
            assert.ok(error instanceof Error);
            assert.strictEqual(
                error.message,
                'Package "pkg-b" does not expose "/b/internal.ts" for cross-package substitution'
            );
        }
    });

    test('findAllPathReplacements returns one bundle dependency entry per matched file', function () {
        const bundleB = exposingBundle('pkg-b', '/b/helpers.ts', 'helpers.ts');
        const bundleC = exposingBundle('pkg-c', '/c/helpers.ts', 'helpers.ts');

        const result = findAllPathReplacements([ '/b/helpers.ts', '/c/helpers.ts' ], [ bundleB, bundleC ], []);

        assert.deepStrictEqual(result.bundleDependencies, [ 'pkg-b', 'pkg-c' ]);
    });

    test('findAllPathReplacements maps peer internals to a reachable exported module', function () {
        const bundle = peerBundleWithEntryDeclaration("export type { Internal } from './internal.js';\n");

        const result = findAllPathReplacements([ '/b/internal.d.ts' ], [], [ bundle ]);

        assert.strictEqual(result.importPathReplacements.get('/b/internal.d.ts'), 'pkg-b/entry.js');
        assert.deepStrictEqual(result.bundleDependencies, [ 'pkg-b' ]);
    });

    test('findAllPathReplacements rejects peer internals that no exported module reaches', function () {
        const bundle = peerBundleWithEntryDeclaration(
            "export declare const value: import('./internal.js').Internal;\n"
        );

        try {
            findAllPathReplacements([ '/b/internal.d.ts' ], [], [ bundle ]);
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
