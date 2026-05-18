import assert from 'node:assert';
import { suite, test } from 'mocha';
import { versionedBundleWithManifest } from '../test-libraries/bundle-fixtures.ts';
import { fooPackageConfigFactory } from '../test-libraries/config-fixtures.ts';
import type { VersionedBundleWithManifest } from '../version-manager/versioned-bundle.ts';
import { configToBuildAndPublishOptions } from './map-config.ts';

type ConfigArgs = Parameters<typeof configToBuildAndPublishOptions>;
type PackageConfigInput = ConfigArgs[1] extends Readonly<Record<string, infer V>> ? V : never;
type PacktoryConfigInput = ConfigArgs[2];

const placeholderPackage = fooPackageConfigFactory.build({ name: '', sourcesFolder: '' });

function fooPackageWithAdditionalFiles(
    additionalFiles: readonly { readonly sourceFilePath: string; readonly targetFilePath: string }[]
): ReturnType<typeof fooPackageConfigFactory.build> & {
    readonly additionalFiles: readonly { readonly sourceFilePath: string; readonly targetFilePath: string }[];
} {
    return { ...fooPackageConfigFactory.build(), additionalFiles };
}

function runMapConfig(
    packageConfig: PackageConfigInput,
    options: {
        readonly commonPackageSettings?: PacktoryConfigInput['commonPackageSettings'];
        readonly bundleDependencies?: readonly VersionedBundleWithManifest[];
        readonly packageName?: string;
        readonly extraConfig?: Partial<PacktoryConfigInput>;
        readonly extraPackages?: readonly PackageConfigInput[];
    } = {}
): ReturnType<typeof configToBuildAndPublishOptions> {
    const packageName = options.packageName ?? 'foo';
    const additionalPackages = options.extraPackages ?? [placeholderPackage];
    const commonProvidesPublishSettings = options.commonPackageSettings?.publishSettings !== undefined;
    const packageProvidesPublishSettings = packageConfig.publishSettings !== undefined;
    const needsPublishSettingsFallback = !commonProvidesPublishSettings && !packageProvidesPublishSettings;
    const fallbackPackage: PackageConfigInput = {
        publishSettings: { access: 'public' },
        ...packageConfig
    };
    const packageWithFallback = needsPublishSettingsFallback ? fallbackPackage : packageConfig;
    const baseConfig = {
        registrySettings: { auth: { type: 'bearer-token', token: 'token' } },
        ...options.extraConfig,
        ...(options.commonPackageSettings === undefined
            ? {}
            : { commonPackageSettings: options.commonPackageSettings }),
        packages: [packageWithFallback, ...additionalPackages]
    } as unknown as PacktoryConfigInput;
    return configToBuildAndPublishOptions(
        packageName,
        { [packageName]: packageWithFallback },
        baseConfig,
        options.bundleDependencies ?? []
    );
}

function runMapConfigExpectingError(
    packageConfig: PackageConfigInput,
    expectedMessage: string,
    options: Parameters<typeof runMapConfig>[1] = {}
): void {
    try {
        runMapConfig(packageConfig, options);
        assert.fail('Expected configToBuildAndPublishOptions() should fail but it did not');
    } catch (error: unknown) {
        assert.strictEqual((error as Error).message, expectedMessage);
    }
}

suite('map-config', function () {
    test('throws when the given packageName doesn’t exist in the configs', function () {
        try {
            configToBuildAndPublishOptions(
                'foo',
                {},
                {
                    registrySettings: { auth: { type: 'bearer-token', token: 'token' } },
                    packages: [
                        {
                            name: '',
                            sourcesFolder: '',
                            roots: { main: { js: '' } },
                            mainPackageJson: { type: 'module' }
                        }
                    ]
                },
                []
            );
            assert.fail('Expected configToBuildAndPublishOptions() should fail but it did not');
        } catch (error: unknown) {
            assert.strictEqual((error as Error).message, 'Config for package "foo" is missing');
        }
    });

    test('throws when the sourcesFolder is missing after config merging', function () {
        runMapConfigExpectingError(
            {
                name: 'foo',
                roots: { main: { js: '' } },
                mainPackageJson: { type: 'module' }
            } as unknown as PackageConfigInput,
            'Config for package "foo" is missing the sources folder'
        );
    });

    test('throws when the main package.json settings are missing after config merging', function () {
        runMapConfigExpectingError(
            { name: 'foo', sourcesFolder: '/src', roots: { main: { js: '' } } } as unknown as PackageConfigInput,
            'Config for package "foo" is missing the main package.json settings'
        );
    });

    test('doesn’t change js roots when they are already absolute paths', function () {
        const packageConfig = fooPackageConfigFactory.build({ roots: { main: { js: '/the-entry-file' } } });

        const result = runMapConfig(packageConfig, { extraPackages: [] });

        assert.deepStrictEqual(result.roots, { main: { js: '/the-entry-file' } });
    });

    test('merges deadCodeElimination settings into the prepared shared options', function () {
        const packageConfig = {
            ...fooPackageConfigFactory.build(),
            deadCodeElimination: { enabled: false, pureConstructors: ['Map'] }
        } as unknown as PackageConfigInput;

        const result = runMapConfig(packageConfig, {
            commonPackageSettings: {
                publishSettings: { access: 'public' },
                deadCodeElimination: { enabled: true, pureImports: [{ from: 'zod/mini' }], pureConstructors: ['Set'] }
            }
        });

        assert.deepStrictEqual(result.deadCodeElimination, {
            enabled: false,
            pureImports: [{ from: 'zod/mini' }],
            pureConstructors: ['Map']
        });
    });

    test('adds the sourcesFolder as a prefix to a js root when it is a relative path', function () {
        const packageConfig = fooPackageConfigFactory.build({ roots: { main: { js: 'the-entry-file' } } });

        const result = runMapConfig(packageConfig, { extraPackages: [] });

        assert.deepStrictEqual(result.roots, { main: { js: 'the-source/the-entry-file' } });
    });

    test('throws when a package has no roots after config lookup', function () {
        runMapConfigExpectingError(
            {
                name: 'foo',
                sourcesFolder: 'the-source',
                roots: {},
                mainPackageJson: { type: 'module' }
            } as unknown as PackageConfigInput,
            'Package "foo" must define at least one root'
        );
    });

    test('normalizes every configured root', function () {
        const packageConfig = fooPackageConfigFactory.build({
            roots: {
                main: { js: 'first.js' },
                secondary: { js: 'second.js', declarationFile: 'second.d.ts' }
            },
            defaultModuleRoot: 'main'
        });

        const result = runMapConfig(packageConfig, { extraPackages: [] });

        assert.deepStrictEqual(result.roots, {
            main: { js: 'the-source/first.js' },
            secondary: { js: 'the-source/second.js', declarationFile: 'the-source/second.d.ts' }
        });
    });

    test('throws when multiple implicit roots are configured without defaultModuleRoot', function () {
        runMapConfigExpectingError(
            fooPackageConfigFactory.build({
                roots: {
                    main: { js: 'first.js' },
                    secondary: { js: 'second.js' }
                },
                defaultModuleRoot: undefined
            }),
            'Config for package "foo" is missing defaultModuleRoot',
            { extraPackages: [] }
        );
    });

    test('uses the configured defaultModuleRoot when multiple implicit roots exist', function () {
        const result = runMapConfig(
            fooPackageConfigFactory.build({
                roots: {
                    main: { js: 'first.js' },
                    secondary: { js: 'second.js' }
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
        const result = runMapConfig(
            {
                name: 'foo',
                sourcesFolder: 'the-source',
                roots: {
                    main: { js: 'index.js' }
                },
                mainPackageJson: { type: 'module' }
            } as unknown as PackageConfigInput,
            { extraPackages: [] }
        );

        assert.deepStrictEqual(result.surface, {
            mode: 'implicit',
            defaultModuleRoot: 'main'
        });
    });

    test('preserves an explicit package surface when packageInterface is configured', function () {
        const result = runMapConfig(
            {
                name: 'foo',
                sourcesFolder: 'the-source',
                roots: {
                    main: { js: 'index.js' },
                    cli: { js: 'cli.js' }
                },
                mainPackageJson: { type: 'module' },
                packageInterface: {
                    modules: [{ root: 'main', export: '.' }],
                    bins: [{ root: 'cli', name: 'foo' }]
                }
            } as unknown as PackageConfigInput,
            { extraPackages: [] }
        );

        assert.deepStrictEqual(result.surface, {
            mode: 'explicit',
            packageInterface: {
                modules: [{ root: 'main', export: '.' }],
                bins: [{ root: 'cli', name: 'foo' }]
            }
        });
    });

    test('doesn’t change declarationFile root paths when they are already absolute', function () {
        const packageConfig = fooPackageConfigFactory.build({
            roots: { main: { js: '/js-file', declarationFile: '/declaration-file' } }
        });

        const result = runMapConfig(packageConfig, { extraPackages: [] });

        assert.deepStrictEqual(result.roots, { main: { js: '/js-file', declarationFile: '/declaration-file' } });
    });

    test('adds the sourcesFolder as a prefix to a declarationFile root path when it is relative', function () {
        const packageConfig = fooPackageConfigFactory.build({
            roots: { main: { js: '/js-file', declarationFile: 'declaration-file' } }
        });

        const result = runMapConfig(packageConfig, { extraPackages: [] });

        assert.deepStrictEqual(result.roots, {
            main: { js: '/js-file', declarationFile: 'the-source/declaration-file' }
        });
    });

    test('doesn’t change an additionalFile sourcePathFile when it is already an absolute path', function () {
        const packageConfig = fooPackageWithAdditionalFiles([{ sourceFilePath: '/foo', targetFilePath: 'bar' }]);

        const result = runMapConfig(packageConfig, { extraPackages: [] });

        assert.deepStrictEqual(result.additionalFiles, [{ sourceFilePath: '/foo', targetFilePath: 'bar' }]);
    });

    test('adds the sourceFolder as prefix to an additionalFile sourcePathFile when it is a relative path', function () {
        const packageConfig = fooPackageWithAdditionalFiles([{ sourceFilePath: 'foo', targetFilePath: 'bar' }]);

        const result = runMapConfig(packageConfig, { extraPackages: [] });

        assert.deepStrictEqual(result.additionalFiles, [{ sourceFilePath: 'the-source/foo', targetFilePath: 'bar' }]);
    });

    test('throws an error when a bundle dependency does not exist', function () {
        runMapConfigExpectingError(
            { ...fooPackageConfigFactory.build(), bundleDependencies: ['bar'] },
            'Dependent bundle "bar" not found'
        );
    });

    test('maps the bundle dependency names correctly to the VersionedBundleWithManifest objects when it exists', function () {
        const bundleDependency = versionedBundleWithManifest({
            name: 'bar',
            packageJson: { name: 'bar', version: '' }
        });
        const options = runMapConfig(
            { ...fooPackageConfigFactory.build(), bundleDependencies: ['bar'] },
            { bundleDependencies: [bundleDependency] }
        );

        assert.deepStrictEqual(options.bundleDependencies, [bundleDependency]);
    });

    test('defaults the includeSourceMapFiles option to false when it is not in the package config nor in common settings', function () {
        const result = runMapConfig(fooPackageConfigFactory.build());

        assert.strictEqual(result.includeSourceMapFiles, false);
    });

    test('sets the includeSourceMapFiles option to true when it is true in the per package config and not set in common settings', function () {
        const result = runMapConfig({ ...fooPackageConfigFactory.build(), includeSourceMapFiles: true });

        assert.strictEqual(result.includeSourceMapFiles, true);
    });

    test('sets the includeSourceMapFiles option to true when it is not set in the per package config but set in common settings', function () {
        const result = runMapConfig(fooPackageConfigFactory.build(), {
            commonPackageSettings: { includeSourceMapFiles: true }
        });

        assert.strictEqual(result.includeSourceMapFiles, true);
    });

    test('sets the includeSourceMapFiles option to false when it is set to false the per package config and set to true in the common settings', function () {
        const result = runMapConfig(
            { ...fooPackageConfigFactory.build(), includeSourceMapFiles: false },
            { commonPackageSettings: { includeSourceMapFiles: true } }
        );

        assert.strictEqual(result.includeSourceMapFiles, false);
    });

    test('merges the additional files if they are set both in common settings and per package settings', function () {
        const result = runMapConfig(fooPackageWithAdditionalFiles([{ sourceFilePath: 'foo', targetFilePath: 'bar' }]), {
            commonPackageSettings: { additionalFiles: [{ sourceFilePath: 'baz', targetFilePath: 'qux' }] },
            extraPackages: []
        });

        assert.deepStrictEqual(result.additionalFiles, [
            { sourceFilePath: 'the-source/baz', targetFilePath: 'qux' },
            { sourceFilePath: 'the-source/foo', targetFilePath: 'bar' }
        ]);
    });

    test('overwrites the additional files from common settings when a per package setting defines a file with the same target', function () {
        const result = runMapConfig(fooPackageWithAdditionalFiles([{ sourceFilePath: 'foo', targetFilePath: 'bar' }]), {
            commonPackageSettings: { additionalFiles: [{ sourceFilePath: 'baz', targetFilePath: 'bar' }] },
            extraPackages: []
        });

        assert.deepStrictEqual(result.additionalFiles, [{ sourceFilePath: 'the-source/foo', targetFilePath: 'bar' }]);
    });

    test('uses only the additionalFiles from common settings when the per package settings don’t have additional files specified', function () {
        const result = runMapConfig(fooPackageConfigFactory.build(), {
            commonPackageSettings: { additionalFiles: [{ sourceFilePath: 'baz', targetFilePath: 'bar' }] },
            extraPackages: []
        });

        assert.deepStrictEqual(result.additionalFiles, [{ sourceFilePath: 'the-source/baz', targetFilePath: 'bar' }]);
    });

    test('removes additional files which are duplicated by picking the last one', function () {
        const result = runMapConfig(
            fooPackageWithAdditionalFiles([
                { sourceFilePath: 'foo', targetFilePath: 'bar' },
                { sourceFilePath: 'baz', targetFilePath: 'bar' }
            ]),
            { extraPackages: [] }
        );

        assert.deepStrictEqual(result.additionalFiles, [{ sourceFilePath: 'the-source/baz', targetFilePath: 'bar' }]);
    });

    test('sets additionalPackageJsonAttributes to an empty object when they are not defined at all', function () {
        const result = runMapConfig(fooPackageConfigFactory.build(), { extraPackages: [] });

        assert.deepStrictEqual(result.additionalPackageJsonAttributes, {});
    });

    test('sets additionalPackageJsonAttributes to the value of the per package settings', function () {
        const result = runMapConfig(
            { ...fooPackageConfigFactory.build(), additionalPackageJsonAttributes: { foo: 'bar' } },
            { extraPackages: [] }
        );

        assert.deepStrictEqual(result.additionalPackageJsonAttributes, { foo: 'bar' });
    });

    test('sets additionalPackageJsonAttributes to the value of the common settings', function () {
        const result = runMapConfig(fooPackageConfigFactory.build(), {
            commonPackageSettings: { additionalPackageJsonAttributes: { foo: 'bar' } },
            extraPackages: []
        });

        assert.deepStrictEqual(result.additionalPackageJsonAttributes, { foo: 'bar' });
    });

    test('defaults versioning to automatic when the package config does not specify it', function () {
        const result = runMapConfig(fooPackageConfigFactory.build(), { extraPackages: [] });

        assert.deepStrictEqual(result.versioning, { automatic: true });
    });

    test('preserves explicit package versioning settings', function () {
        const result = runMapConfig(
            { ...fooPackageConfigFactory.build(), versioning: { automatic: false, version: '2.3.4' } },
            { extraPackages: [] }
        );

        assert.deepStrictEqual(result.versioning, { automatic: false, version: '2.3.4' });
    });

    test('merges additionalPackageJsonAttributes from per package and common settings', function () {
        const result = runMapConfig(
            { ...fooPackageConfigFactory.build(), additionalPackageJsonAttributes: { baz: 'qux' } },
            {
                commonPackageSettings: { additionalPackageJsonAttributes: { foo: 'bar' } },
                extraPackages: []
            }
        );

        assert.deepStrictEqual(result.additionalPackageJsonAttributes, { foo: 'bar', baz: 'qux' });
    });

    test('overwrites additionalPackageJsonAttributes from common settings when there are also defined in per package settings', function () {
        const result = runMapConfig(
            { ...fooPackageConfigFactory.build(), additionalPackageJsonAttributes: { foo: 'qux' } },
            {
                commonPackageSettings: { additionalPackageJsonAttributes: { foo: 'bar' } },
                extraPackages: []
            }
        );

        assert.deepStrictEqual(result.additionalPackageJsonAttributes, { foo: 'qux' });
    });

    test('uses the common publishSettings when the package config does not override it', function () {
        const result = runMapConfig(fooPackageConfigFactory.build(), {
            commonPackageSettings: { publishSettings: { access: 'public', provenance: { type: 'auto' } } },
            extraPackages: []
        });

        assert.deepStrictEqual(result.publishSettings, { access: 'public', provenance: { type: 'auto' } });
    });

    test('prefers the per-package publishSettings over the common default', function () {
        const result = runMapConfig(
            { ...fooPackageConfigFactory.build(), publishSettings: { access: 'restricted' } },
            {
                commonPackageSettings: { publishSettings: { access: 'public' } },
                extraPackages: []
            }
        );

        assert.deepStrictEqual(result.publishSettings, { access: 'restricted' });
    });

    test('defaults allowMutableSpecifiers to an empty array when no dependencyPolicy is configured', function () {
        const result = runMapConfig(fooPackageConfigFactory.build(), { extraPackages: [] });

        assert.deepStrictEqual(result.allowMutableSpecifiers, []);
    });

    test('uses the per-package dependencyPolicy.allowMutableSpecifiers when set', function () {
        const result = runMapConfig(
            { ...fooPackageConfigFactory.build(), dependencyPolicy: { allowMutableSpecifiers: ['react'] } },
            { extraPackages: [] }
        );

        assert.deepStrictEqual(result.allowMutableSpecifiers, ['react']);
    });

    test('falls back to the common dependencyPolicy.allowMutableSpecifiers when the package does not set it', function () {
        const result = runMapConfig(fooPackageConfigFactory.build(), {
            commonPackageSettings: { dependencyPolicy: { allowMutableSpecifiers: ['shared-fork'] } },
            extraPackages: []
        });

        assert.deepStrictEqual(result.allowMutableSpecifiers, ['shared-fork']);
    });

    test('per-package dependencyPolicy fully replaces the common dependencyPolicy', function () {
        const result = runMapConfig(
            { ...fooPackageConfigFactory.build(), dependencyPolicy: { allowMutableSpecifiers: ['only-this'] } },
            {
                commonPackageSettings: { dependencyPolicy: { allowMutableSpecifiers: ['common-only'] } },
                extraPackages: []
            }
        );

        assert.deepStrictEqual(result.allowMutableSpecifiers, ['only-this']);
    });

    test('throws a "missing publish settings" error when neither commonPackageSettings nor the package supplies one', function () {
        const packageWithoutPublishSettings = fooPackageConfigFactory.build();
        const config = {
            registrySettings: { auth: { type: 'bearer-token', token: 'token' } },
            packages: [packageWithoutPublishSettings]
        } as unknown as PacktoryConfigInput;

        assert.throws(
            () => {
                configToBuildAndPublishOptions('foo', { foo: packageWithoutPublishSettings }, config, []);
            },
            { message: 'Config for package "foo" is missing publish settings' }
        );
    });
});
