import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { PackageConfiguration } from '../configuration/configuration.ts';
import { versionedBundleWithManifest } from '../test-libraries/bundle-fixtures.ts';
import {
    fooPackageConfigurationFactory
} from '../test-libraries/configuration-fixtures.ts';
import {
    fooPackageWithAdditionalFiles,
    runMapConfiguration,
    runMapConfigurationExpectingError
} from '../test-libraries/configuration-mapping-fixtures.ts';
import {
    configurationToBuildAndPublishOptions
} from './map-configuration.ts';

function registerValidationTests(): void {
    test('throws when the given packageName doesn’t exist in the configs', function () {
        try {
            configurationToBuildAndPublishOptions(
                'foo',
                {},
                {
                    registrySettings: { authentication: { type: 'bearer-token', token: 'token' } },
                    packages: [
                        {
                            name: '',
                            sourcesFolder: '',
                            roots: { main: { javaScript: '' } },
                            mainPackageManifest: { type: 'module' }
                        }
                    ]
                },
                { existingBundles: [] }
            );
            assert.fail('Expected configurationToBuildAndPublishOptions() should fail but it did not');
        } catch (error: unknown) {
            assert.strictEqual((error as Error).message, 'Config for package "foo" is missing');
        }
    });

    test('throws when the sourcesFolder is missing after config merging', function () {
        runMapConfigurationExpectingError(
            {
                name: 'foo',
                roots: { main: { javaScript: '' } },
                mainPackageManifest: { type: 'module' }
            } as unknown as PackageConfiguration,
            'Config for package "foo" is missing the sources folder'
        );
    });

    test('throws when the main package.json settings are missing after config merging', function () {
        runMapConfigurationExpectingError(
            { name: 'foo', sourcesFolder: '/source', roots: { main: { javaScript: '' } } },
            'Config for package "foo" is missing the main package.json settings'
        );
    });

    test('doesn’t change js roots when they are already absolute paths', function () {
        const packageConfiguration = fooPackageConfigurationFactory.build({
            roots: { main: { javaScript: '/the-entry-file' } }
        });

        const result = runMapConfiguration(packageConfiguration, { extraPackages: [] });

        assert.deepStrictEqual(result.roots, { main: { javaScript: '/the-entry-file' } });
    });

    test('merges deadCodeElimination settings into the prepared shared options', function () {
        const packageConfiguration = {
            ...fooPackageConfigurationFactory.build(),
            deadCodeElimination: { enabled: false, pureConstructors: [ 'Map' ] }
        } as unknown as PackageConfiguration;

        const result = runMapConfiguration(packageConfiguration, {
            commonPackageSettings: {
                publishSettings: { access: 'public' },
                deadCodeElimination: {
                    enabled: true,
                    pureImports: [ { from: 'builder-library' } ],
                    pureConstructors: [ 'Set' ]
                }
            }
        });

        assert.deepStrictEqual(result.deadCodeElimination, {
            enabled: false,
            pureImports: [ { from: 'builder-library' } ],
            pureConstructors: [ 'Map' ]
        });
    });

    test('adds the sourcesFolder as a prefix to a js root when it is a relative path', function () {
        const packageConfiguration = fooPackageConfigurationFactory.build({
            roots: { main: { javaScript: 'the-entry-file' } }
        });

        const result = runMapConfiguration(packageConfiguration, { extraPackages: [] });

        assert.deepStrictEqual(result.roots, { main: { javaScript: 'the-source/the-entry-file' } });
    });

    test('throws when a package has no roots after config lookup', function () {
        runMapConfigurationExpectingError(
            {
                name: 'foo',
                sourcesFolder: 'the-source',
                roots: {},
                mainPackageManifest: { type: 'module' }
            } as unknown as PackageConfiguration,
            'Package "foo" must define at least one root'
        );
    });
}

function registerRootAndSurfaceTests(): void {
    test('normalizes every configured root', function () {
        const packageConfiguration = fooPackageConfigurationFactory.build({
            roots: {
                main: { javaScript: 'first.js' },
                secondary: { javaScript: 'second.js', declarationFile: 'second.d.ts' }
            },
            defaultModuleRoot: 'main'
        });

        const result = runMapConfiguration(packageConfiguration, { extraPackages: [] });

        assert.deepStrictEqual(result.roots, {
            main: { javaScript: 'the-source/first.js' },
            secondary: { javaScript: 'the-source/second.js', declarationFile: 'the-source/second.d.ts' }
        });
    });

    test('throws when multiple implicit roots are configured without defaultModuleRoot', function () {
        runMapConfigurationExpectingError(
            fooPackageConfigurationFactory.build({
                roots: {
                    main: { javaScript: 'first.js' },
                    secondary: { javaScript: 'second.js' }
                },
                defaultModuleRoot: undefined
            }),
            'Config for package "foo" is missing defaultModuleRoot',
            { extraPackages: [] }
        );
    });

    test('uses the configured defaultModuleRoot when multiple implicit roots exist', function () {
        const result = runMapConfiguration(
            fooPackageConfigurationFactory.build({
                roots: {
                    main: { javaScript: 'first.js' },
                    secondary: { javaScript: 'second.js' }
                },
                defaultModuleRoot: 'secondary'
            }),
            { extraPackages: [] }
        );

        assert.deepStrictEqual(result.surface, {
            mode: 'implicit',
            defaultModuleRoot: 'secondary'
        });
    });

    test('builds an implicit surface when packageInterface is not configured', function () {
        const result = runMapConfiguration(
            {
                name: 'foo',
                sourcesFolder: 'the-source',
                roots: {
                    main: { javaScript: 'index.js' }
                },
                mainPackageManifest: { type: 'module' }
            } as unknown as PackageConfiguration,
            { extraPackages: [] }
        );

        assert.deepStrictEqual(result.surface, {
            mode: 'implicit',
            defaultModuleRoot: 'main'
        });
    });

    test('preserves an explicit package surface when packageInterface is configured', function () {
        const result = runMapConfiguration(
            {
                name: 'foo',
                sourcesFolder: 'the-source',
                roots: {
                    main: { javaScript: 'index.js' },
                    commandLineInterface: { javaScript: 'cli.js' }
                },
                mainPackageManifest: { type: 'module' },
                packageInterface: {
                    modules: [ { root: 'main', export: '.' } ],
                    executables: [ { root: 'commandLineInterface', name: 'foo' } ]
                }
            } as unknown as PackageConfiguration,
            { extraPackages: [] }
        );

        assert.deepStrictEqual(result.surface, {
            mode: 'explicit',
            packageInterface: {
                modules: [ { root: 'main', export: '.' } ],
                executables: [ { root: 'commandLineInterface', name: 'foo' } ]
            }
        });
    });

    test('doesn’t change declarationFile root paths when they are already absolute', function () {
        const packageConfiguration = fooPackageConfigurationFactory.build({
            roots: { main: { javaScript: '/js-file', declarationFile: '/declaration-file' } }
        });

        const result = runMapConfiguration(packageConfiguration, { extraPackages: [] });

        assert.deepStrictEqual(result.roots, {
            main: { javaScript: '/js-file', declarationFile: '/declaration-file' }
        });
    });

    test('adds the sourcesFolder as a prefix to a declarationFile root path when it is relative', function () {
        const packageConfiguration = fooPackageConfigurationFactory.build({
            roots: { main: { javaScript: '/js-file', declarationFile: 'declaration-file' } }
        });

        const result = runMapConfiguration(packageConfiguration, { extraPackages: [] });

        assert.deepStrictEqual(result.roots, {
            main: { javaScript: '/js-file', declarationFile: 'the-source/declaration-file' }
        });
    });

    test('doesn’t change an additionalFile sourcePathFile when it is already an absolute path', function () {
        const packageConfiguration = fooPackageWithAdditionalFiles([ {
            inputFilePath: '/foo',
            targetFilePath: 'bar'
        } ]);

        const result = runMapConfiguration(packageConfiguration, { extraPackages: [] });

        assert.deepStrictEqual(result.additionalFiles, [ { inputFilePath: '/foo', targetFilePath: 'bar' } ]);
    });

    test('adds the sourceFolder as prefix to an additionalFile sourcePathFile when it is a relative path', function () {
        const packageConfiguration = fooPackageWithAdditionalFiles([ { inputFilePath: 'foo', targetFilePath: 'bar' } ]);

        const result = runMapConfiguration(packageConfiguration, { extraPackages: [] });

        assert.deepStrictEqual(result.additionalFiles, [ { inputFilePath: 'the-source/foo', targetFilePath: 'bar' } ]);
    });
}

function registerDependencyAndFileOptionTests(): void {
    test('throws an error when a bundle dependency does not exist', function () {
        runMapConfigurationExpectingError(
            { ...fooPackageConfigurationFactory.build(), bundleDependencies: [ 'bar' ] },
            'Dependent bundle "bar" not found'
        );
    });

    test('maps the bundle dependency names correctly to the VersionedBundleWithManifest objects when it exists', function () {
        const bundleDependency = versionedBundleWithManifest({
            name: 'bar',
            packageManifest: { name: 'bar', version: '' }
        });
        const options = runMapConfiguration(
            { ...fooPackageConfigurationFactory.build(), bundleDependencies: [ 'bar' ] },
            {
                bundleDependencies: [ bundleDependency ],
                extraPackages: [ { ...fooPackageConfigurationFactory.build(), name: 'bar' } ]
            }
        );

        assert.deepStrictEqual([
            options.bundleDependencies,
            options.bundleDependencyClosure
        ], [ [ bundleDependency ], [ bundleDependency ] ]);
    });

    test('defaults the includeSourceMapFiles option to false when it is not in the package config nor in common settings', function () {
        const result = runMapConfiguration(fooPackageConfigurationFactory.build());

        assert.strictEqual(result.includeSourceMapFiles, false);
    });

    test('sets the includeSourceMapFiles option to true when it is true in the per package config and not set in common settings', function () {
        const result = runMapConfiguration({ ...fooPackageConfigurationFactory.build(), includeSourceMapFiles: true });

        assert.strictEqual(result.includeSourceMapFiles, true);
    });

    test('sets the includeSourceMapFiles option to true when it is not set in the per package config but set in common settings', function () {
        const result = runMapConfiguration(fooPackageConfigurationFactory.build(), {
            commonPackageSettings: { includeSourceMapFiles: true }
        });

        assert.strictEqual(result.includeSourceMapFiles, true);
    });

    test('sets the includeSourceMapFiles option to false when it is set to false the per package config and set to true in the common settings', function () {
        const result = runMapConfiguration(
            { ...fooPackageConfigurationFactory.build(), includeSourceMapFiles: false },
            { commonPackageSettings: { includeSourceMapFiles: true } }
        );

        assert.strictEqual(result.includeSourceMapFiles, false);
    });

    test('merges the additional files if they are set both in common settings and per package settings', function () {
        const result = runMapConfiguration(
            fooPackageWithAdditionalFiles([ { inputFilePath: 'foo', targetFilePath: 'bar' } ]),
            {
                commonPackageSettings: { additionalFiles: [ { inputFilePath: 'baz', targetFilePath: 'qux' } ] },
                extraPackages: []
            }
        );

        assert.deepStrictEqual(result.additionalFiles, [
            { inputFilePath: 'the-source/baz', targetFilePath: 'qux' },
            { inputFilePath: 'the-source/foo', targetFilePath: 'bar' }
        ]);
    });

    test('overwrites the additional files from common settings when a per package setting defines a file with the same target', function () {
        const result = runMapConfiguration(
            fooPackageWithAdditionalFiles([ { inputFilePath: 'foo', targetFilePath: 'bar' } ]),
            {
                commonPackageSettings: { additionalFiles: [ { inputFilePath: 'baz', targetFilePath: 'bar' } ] },
                extraPackages: []
            }
        );

        assert.deepStrictEqual(result.additionalFiles, [ { inputFilePath: 'the-source/foo', targetFilePath: 'bar' } ]);
    });

    test('uses only the additionalFiles from common settings when the per package settings don’t have additional files specified', function () {
        const result = runMapConfiguration(fooPackageConfigurationFactory.build(), {
            commonPackageSettings: { additionalFiles: [ { inputFilePath: 'baz', targetFilePath: 'bar' } ] },
            extraPackages: []
        });

        assert.deepStrictEqual(result.additionalFiles, [ { inputFilePath: 'the-source/baz', targetFilePath: 'bar' } ]);
    });

    test('removes additional files which are duplicated by picking the last one', function () {
        const result = runMapConfiguration(
            fooPackageWithAdditionalFiles([
                { inputFilePath: 'foo', targetFilePath: 'bar' },
                { inputFilePath: 'baz', targetFilePath: 'bar' }
            ]),
            { extraPackages: [] }
        );

        assert.deepStrictEqual(result.additionalFiles, [ { inputFilePath: 'the-source/baz', targetFilePath: 'bar' } ]);
    });
}

function registerPackageManifestAndVersioningTests(): void {
    test('sets additionalPackageManifestAttributes to an empty object when they are not defined at all', function () {
        const result = runMapConfiguration(fooPackageConfigurationFactory.build(), { extraPackages: [] });

        assert.deepStrictEqual(result.additionalPackageManifestAttributes, {});
    });

    test('sets additionalPackageManifestAttributes to the value of the per package settings', function () {
        const result = runMapConfiguration(
            { ...fooPackageConfigurationFactory.build(), additionalPackageManifestAttributes: { foo: 'bar' } },
            { extraPackages: [] }
        );

        assert.deepStrictEqual(result.additionalPackageManifestAttributes, { foo: 'bar' });
    });

    test('sets additionalPackageManifestAttributes to the value of the common settings', function () {
        const result = runMapConfiguration(fooPackageConfigurationFactory.build(), {
            commonPackageSettings: { additionalPackageManifestAttributes: { foo: 'bar' } },
            extraPackages: []
        });

        assert.deepStrictEqual(result.additionalPackageManifestAttributes, { foo: 'bar' });
    });

    test('defaults versioning to automatic when the package config does not specify it', function () {
        const result = runMapConfiguration(fooPackageConfigurationFactory.build(), { extraPackages: [] });

        assert.deepStrictEqual(result.versioning, { automatic: true });
    });

    test('preserves explicit package versioning settings', function () {
        const result = runMapConfiguration(
            { ...fooPackageConfigurationFactory.build(), versioning: { automatic: false, version: '2.3.4' } },
            { extraPackages: [] }
        );

        assert.deepStrictEqual(result.versioning, { automatic: false, version: '2.3.4' });
    });

    test('resolves source package versioning settings', async function () {
        const provideVersion = async function (): Promise<string> {
            return '2.3.4';
        };
        const result = runMapConfiguration(
            {
                ...fooPackageConfigurationFactory.build(),
                versioning: { automatic: false, source: 'pull-request-labels' }
            },
            {
                extraPackages: [],
                resolveVersionSource({ packageName, source }) {
                    assert.strictEqual(packageName, 'foo');
                    assert.deepStrictEqual(source, { automatic: false, source: 'pull-request-labels' });
                    return provideVersion;
                }
            }
        );

        assert.deepStrictEqual(result.versioning, { automatic: false, provideVersion });
        assert.strictEqual(
            await result.versioning.provideVersion({
                packageName: 'foo',
                currentVersion: undefined,
                targetSourceFiles: [],
                ignoredAttributionPaths: [],
                registrySettings: { authentication: { type: 'bearer-token', token: 'token' } },
                stage: false
            }),
            '2.3.4'
        );
    });

    test('throws when source package versioning has no resolver', function () {
        runMapConfigurationExpectingError(
            {
                ...fooPackageConfigurationFactory.build(),
                versioning: { automatic: false, source: 'pull-request-labels' }
            },
            'Manual version source "pull-request-labels" is not available',
            { extraPackages: [] }
        );
    });

    test('merges additionalPackageManifestAttributes from per package and common settings', function () {
        const result = runMapConfiguration(
            { ...fooPackageConfigurationFactory.build(), additionalPackageManifestAttributes: { baz: 'qux' } },
            {
                commonPackageSettings: { additionalPackageManifestAttributes: { foo: 'bar' } },
                extraPackages: []
            }
        );

        assert.deepStrictEqual(result.additionalPackageManifestAttributes, { foo: 'bar', baz: 'qux' });
    });

    test('overwrites additionalPackageManifestAttributes from common settings when there are also defined in per package settings', function () {
        const result = runMapConfiguration(
            { ...fooPackageConfigurationFactory.build(), additionalPackageManifestAttributes: { foo: 'qux' } },
            {
                commonPackageSettings: { additionalPackageManifestAttributes: { foo: 'bar' } },
                extraPackages: []
            }
        );

        assert.deepStrictEqual(result.additionalPackageManifestAttributes, { foo: 'qux' });
    });
}

function registerPublishAndDependencyPolicyTests(): void {
    test('uses the common publishSettings when the package config does not override it', function () {
        const result = runMapConfiguration(fooPackageConfigurationFactory.build(), {
            commonPackageSettings: { publishSettings: { access: 'public', provenance: { type: 'automatic' } } },
            extraPackages: []
        });

        assert.deepStrictEqual(result.publishSettings, { access: 'public', provenance: { type: 'automatic' } });
    });

    test('prefers the per-package publishSettings over the common default', function () {
        const result = runMapConfiguration(
            { ...fooPackageConfigurationFactory.build(), publishSettings: { access: 'restricted' } },
            {
                commonPackageSettings: { publishSettings: { access: 'public' } },
                extraPackages: []
            }
        );

        assert.deepStrictEqual(result.publishSettings, { access: 'restricted' });
    });

    test('defaults allowMutableSpecifiers to an empty array when no dependencyPolicy is configured', function () {
        const result = runMapConfiguration(fooPackageConfigurationFactory.build(), { extraPackages: [] });

        assert.deepStrictEqual(result.allowMutableSpecifiers, []);
    });

    test('uses the per-package dependencyPolicy.allowMutableSpecifiers when set', function () {
        const result = runMapConfiguration(
            { ...fooPackageConfigurationFactory.build(), dependencyPolicy: { allowMutableSpecifiers: [ 'react' ] } },
            { extraPackages: [] }
        );

        assert.deepStrictEqual(result.allowMutableSpecifiers, [ 'react' ]);
    });

    test('falls back to the common dependencyPolicy.allowMutableSpecifiers when the package does not set it', function () {
        const result = runMapConfiguration(fooPackageConfigurationFactory.build(), {
            commonPackageSettings: { dependencyPolicy: { allowMutableSpecifiers: [ 'shared-fork' ] } },
            extraPackages: []
        });

        assert.deepStrictEqual(result.allowMutableSpecifiers, [ 'shared-fork' ]);
    });

    test('per-package dependencyPolicy fully replaces the common dependencyPolicy', function () {
        const result = runMapConfiguration(
            {
                ...fooPackageConfigurationFactory.build(),
                dependencyPolicy: { allowMutableSpecifiers: [ 'only-this' ] }
            },
            {
                commonPackageSettings: { dependencyPolicy: { allowMutableSpecifiers: [ 'common-only' ] } },
                extraPackages: []
            }
        );

        assert.deepStrictEqual(result.allowMutableSpecifiers, [ 'only-this' ]);
    });
}

suite('map-config', function () {
    registerValidationTests();
    registerRootAndSurfaceTests();
    registerDependencyAndFileOptionTests();
    registerPackageManifestAndVersioningTests();
    registerPublishAndDependencyPolicyTests();
});
