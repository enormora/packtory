import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { VersionedBundle } from '../versioned-bundle.ts';
import { standardVersionedBundle, type VersionedBundleOverrides } from '../../test-libraries/bundle-fixtures.ts';
import { buildPackageManifest } from './builder.ts';

function createBundle(overrides: VersionedBundleOverrides = {}): VersionedBundle {
    return standardVersionedBundle(overrides);
}

function registerManifestFieldTests(): void {
    test('buildPackageManifest() omits optional fields when they are empty or undefined', function () {
        const result = buildPackageManifest(createBundle());

        assert.deepStrictEqual(result, {
            name: 'package-a',
            version: '1.2.3',
            exports: {
                '.': {
                    import: './index.js',
                    types: './index.d.ts'
                }
            },
            type: 'module'
        });
    });

    test('buildPackageManifest() includes dependency, peer dependency, type, and exports fields', function () {
        const result = buildPackageManifest(
            createBundle({
                dependencies: { leftPad: '^1.0.0' },
                peerDependencies: { react: '^19.0.0' },
                packageType: 'module',
                typesMainFile: {
                    sourceFilePath: '/src/index.d.ts',
                    targetFilePath: 'index.d.ts',
                    content: '',
                    isExecutable: false
                }
            })
        );

        assert.deepStrictEqual(result, {
            name: 'package-a',
            version: '1.2.3',
            exports: {
                '.': {
                    import: './index.js',
                    types: './index.d.ts'
                }
            },
            dependencies: { leftPad: '^1.0.0' },
            peerDependencies: { react: '^19.0.0' },
            type: 'module'
        });
    });

    test('buildPackageManifest() includes generated imports when present', function () {
        const result = buildPackageManifest(
            createBundle({
                importsField: {
                    '#foo': './src/foo.js',
                    '#bar/*': { default: [ './src/bar/*.js', './fallback/*.js' ] }
                }
            })
        );

        assert.deepStrictEqual(result, {
            name: 'package-a',
            version: '1.2.3',
            imports: {
                '#foo': './src/foo.js',
                '#bar/*': { default: [ './src/bar/*.js', './fallback/*.js' ] }
            },
            exports: {
                '.': {
                    import: './index.js',
                    types: './index.d.ts'
                }
            },
            type: 'module'
        });
    });

    test('buildPackageManifest() preserves string bin entries when present', function () {
        const result = buildPackageManifest(
            createBundle({
                binField: './cli.js'
            })
        );

        assert.deepStrictEqual(result, {
            name: 'package-a',
            version: '1.2.3',
            bin: './cli.js',
            exports: {
                '.': {
                    import: './index.js',
                    types: './index.d.ts'
                }
            },
            type: 'module'
        });
    });

    test('buildPackageManifest() drops undefined entries from object bin fields', function () {
        const result = buildPackageManifest(
            createBundle({
                binField: { packageA: './cli.js', ignored: undefined } as unknown as NonNullable<
                    VersionedBundle['binField']
                >
            })
        );

        assert.deepStrictEqual(result, {
            name: 'package-a',
            version: '1.2.3',
            bin: { packageA: './cli.js' },
            exports: {
                '.': {
                    import: './index.js',
                    types: './index.d.ts'
                }
            },
            type: 'module'
        });
    });

    test('buildPackageManifest() passes through a scripts block from additional attributes', function () {
        const result = buildPackageManifest(
            createBundle({
                additionalAttributes: { scripts: { postinstall: 'echo hi' } }
            })
        );

        assert.deepStrictEqual(result, {
            name: 'package-a',
            version: '1.2.3',
            exports: {
                '.': {
                    import: './index.js',
                    types: './index.d.ts'
                }
            },
            type: 'module',
            scripts: { postinstall: 'echo hi' }
        });
    });

    test('buildPackageManifest() lets generated manifest fields override conflicting additional attributes', function () {
        const result = buildPackageManifest(
            createBundle({
                additionalAttributes: {
                    name: 'wrong-name',
                    version: '0.0.0',
                    customField: true
                }
            })
        );

        assert.deepStrictEqual(result, {
            name: 'package-a',
            version: '1.2.3',
            exports: {
                '.': {
                    import: './index.js',
                    types: './index.d.ts'
                }
            },
            type: 'module',
            customField: true
        });
    });
}

function registerSideEffectsTests(): void {
    test('buildPackageManifest() omits sideEffects when the bundle has no auto-detected value', function () {
        const result = buildPackageManifest(createBundle());

        assert.strictEqual(Object.hasOwn(result, 'sideEffects'), false);
    });

    test('buildPackageManifest() emits "sideEffects": false when the auto-detected value is false', function () {
        const result = buildPackageManifest(createBundle({ sideEffectsField: false }));

        assert.strictEqual(result.sideEffects, false);
    });

    test('buildPackageManifest() emits the auto-detected file list as "sideEffects"', function () {
        const sideEffectsField = [ './impure.js' ];
        const result = buildPackageManifest(createBundle({ sideEffectsField }));

        assert.deepStrictEqual(result.sideEffects, [ './impure.js' ]);
        assert.notStrictEqual(result.sideEffects, sideEffectsField);
    });

    test('buildPackageManifest() prefers a user-provided sideEffects value in additionalAttributes over the auto-detected one', function () {
        const result = buildPackageManifest(
            createBundle({
                additionalAttributes: { sideEffects: true },
                sideEffectsField: false
            })
        );

        assert.strictEqual(result.sideEffects, true);
    });

    test('buildPackageManifest() preserves a user-provided sideEffects array even when auto-detection would emit different values', function () {
        const result = buildPackageManifest(
            createBundle({
                additionalAttributes: { sideEffects: [ './vendor/setup.js' ] },
                sideEffectsField: [ './other.js' ]
            })
        );

        assert.deepStrictEqual(result.sideEffects, [ './vendor/setup.js' ]);
    });
}

suite('builder', function () {
    registerManifestFieldTests();
    registerSideEffectsTests();
});
