import assert from 'node:assert';
import { test } from 'mocha';
import { versionedBundleWithManifest } from '../test-libraries/bundle-fixtures.ts';
import { fooPackageConfigFactory } from '../test-libraries/config-fixtures.ts';
import type { VersionedBundleWithManifest } from '../version-manager/versioned-bundle.ts';
import { configToBuildAndPublishOptions } from './map-config.ts';

type ConfigArgs = Parameters<typeof configToBuildAndPublishOptions>;
type PackageConfigInput = ConfigArgs[1] extends Map<string, infer V> ? V : never;
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
    const baseConfig = {
        registrySettings: { token: '' },
        ...options.extraConfig,
        ...(options.commonPackageSettings === undefined
            ? {}
            : { commonPackageSettings: options.commonPackageSettings }),
        packages: [packageConfig, ...additionalPackages]
    } as unknown as PacktoryConfigInput;
    return configToBuildAndPublishOptions(
        packageName,
        new Map([[packageName, packageConfig]]),
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

test('throws when the given packageName doesn’t exist in the configs', () => {
    try {
        configToBuildAndPublishOptions(
            'foo',
            new Map(),
            {
                registrySettings: { token: '' },
                packages: [{ name: '', sourcesFolder: '', entryPoints: [{ js: '' }], mainPackageJson: {} }]
            },
            []
        );
        assert.fail('Expected configToBuildAndPublishOptions() should fail but it did not');
    } catch (error: unknown) {
        assert.strictEqual((error as Error).message, 'Config for package "foo" is missing');
    }
});

test('throws when the sourcesFolder is missing after config merging', () => {
    runMapConfigExpectingError(
        { name: 'foo', entryPoints: [{ js: '' }], mainPackageJson: {} } as unknown as PackageConfigInput,
        'Config for package "foo" is missing the sources folder'
    );
});

test('throws when the main package.json settings are missing after config merging', () => {
    runMapConfigExpectingError(
        { name: 'foo', sourcesFolder: '/src', entryPoints: [{ js: '' }] } as unknown as PackageConfigInput,
        'Config for package "foo" is missing the main package.json settings'
    );
});

test('doesn’t change js entryPoints when they are already absolute paths', () => {
    const packageConfig = fooPackageConfigFactory.build({ entryPoints: [{ js: '/the-entry-file' }] });

    const result = runMapConfig(packageConfig, { extraPackages: [] });

    assert.deepStrictEqual(result.entryPoints, [{ js: '/the-entry-file' }]);
});

test('adds the sourcesFolder as a prefix to a js entryPoint when it is a relative path', () => {
    const packageConfig = fooPackageConfigFactory.build({ entryPoints: [{ js: 'the-entry-file' }] });

    const result = runMapConfig(packageConfig, { extraPackages: [] });

    assert.deepStrictEqual(result.entryPoints, [{ js: 'the-source/the-entry-file' }]);
});

test('throws when a package has no entry points after config lookup', () => {
    runMapConfigExpectingError(
        {
            name: 'foo',
            sourcesFolder: 'the-source',
            entryPoints: [],
            mainPackageJson: {}
        } as unknown as PackageConfigInput,
        'Config for package "foo" is missing entry points'
    );
});

test('normalizes every remaining entry point after the first one', () => {
    const packageConfig = fooPackageConfigFactory.build({
        entryPoints: [{ js: 'first.js' }, { js: 'second.js', declarationFile: 'second.d.ts' }]
    });

    const result = runMapConfig(packageConfig, { extraPackages: [] });

    assert.deepStrictEqual(result.entryPoints, [
        { js: 'the-source/first.js' },
        { js: 'the-source/second.js', declarationFile: 'the-source/second.d.ts' }
    ]);
});

test('doesn’t change declarationFile entryPoints when they are already absolute paths', () => {
    const packageConfig = fooPackageConfigFactory.build({
        entryPoints: [{ js: '/js-file', declarationFile: '/declaration-file' }]
    });

    const result = runMapConfig(packageConfig, { extraPackages: [] });

    assert.deepStrictEqual(result.entryPoints, [{ js: '/js-file', declarationFile: '/declaration-file' }]);
});

test('adds the sourcesFolder as a prefix to a declarationFile entryPoint when it is a relative path', () => {
    const packageConfig = fooPackageConfigFactory.build({
        entryPoints: [{ js: '/js-file', declarationFile: 'declaration-file' }]
    });

    const result = runMapConfig(packageConfig, { extraPackages: [] });

    assert.deepStrictEqual(result.entryPoints, [{ js: '/js-file', declarationFile: 'the-source/declaration-file' }]);
});

test('doesn’t change an additionalFile sourcePathFile when it is already an absolute path', () => {
    const packageConfig = fooPackageWithAdditionalFiles([{ sourceFilePath: '/foo', targetFilePath: 'bar' }]);

    const result = runMapConfig(packageConfig, { extraPackages: [] });

    assert.deepStrictEqual(result.additionalFiles, [{ sourceFilePath: '/foo', targetFilePath: 'bar' }]);
});

test('adds the sourceFolder as prefix to an additionalFile sourcePathFile when it is a relative path', () => {
    const packageConfig = fooPackageWithAdditionalFiles([{ sourceFilePath: 'foo', targetFilePath: 'bar' }]);

    const result = runMapConfig(packageConfig, { extraPackages: [] });

    assert.deepStrictEqual(result.additionalFiles, [{ sourceFilePath: 'the-source/foo', targetFilePath: 'bar' }]);
});

test('throws an error when a bundle dependency does not exist', () => {
    runMapConfigExpectingError(
        { ...fooPackageConfigFactory.build(), bundleDependencies: ['bar'] },
        'Dependent bundle "bar" not found'
    );
});

test('maps the bundle dependency names correctly to the VersionedBundleWithManifest objects when it exists', () => {
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

test('defaults the includeSourceMapFiles option to false when it is not in the package config nor in common settings', () => {
    const result = runMapConfig(fooPackageConfigFactory.build());

    assert.strictEqual(result.includeSourceMapFiles, false);
});

test('sets the includeSourceMapFiles option to true when it is true in the per package config and not set in common settings', () => {
    const result = runMapConfig({ ...fooPackageConfigFactory.build(), includeSourceMapFiles: true });

    assert.strictEqual(result.includeSourceMapFiles, true);
});

test('sets the includeSourceMapFiles option to true when it is not set in the per package config but set in common settings', () => {
    const result = runMapConfig(fooPackageConfigFactory.build(), {
        commonPackageSettings: { includeSourceMapFiles: true }
    });

    assert.strictEqual(result.includeSourceMapFiles, true);
});

test('sets the includeSourceMapFiles option to false when it is set to false the per package config and set to true in the common settings', () => {
    const result = runMapConfig(
        { ...fooPackageConfigFactory.build(), includeSourceMapFiles: false },
        { commonPackageSettings: { includeSourceMapFiles: true } }
    );

    assert.strictEqual(result.includeSourceMapFiles, false);
});

test('merges the additional files if they are set both in common settings and per package settings', () => {
    const result = runMapConfig(fooPackageWithAdditionalFiles([{ sourceFilePath: 'foo', targetFilePath: 'bar' }]), {
        commonPackageSettings: { additionalFiles: [{ sourceFilePath: 'baz', targetFilePath: 'qux' }] },
        extraPackages: []
    });

    assert.deepStrictEqual(result.additionalFiles, [
        { sourceFilePath: 'the-source/baz', targetFilePath: 'qux' },
        { sourceFilePath: 'the-source/foo', targetFilePath: 'bar' }
    ]);
});

test('overwrites the additional files from common settings when a per package setting defines a file with the same target', () => {
    const result = runMapConfig(fooPackageWithAdditionalFiles([{ sourceFilePath: 'foo', targetFilePath: 'bar' }]), {
        commonPackageSettings: { additionalFiles: [{ sourceFilePath: 'baz', targetFilePath: 'bar' }] },
        extraPackages: []
    });

    assert.deepStrictEqual(result.additionalFiles, [{ sourceFilePath: 'the-source/foo', targetFilePath: 'bar' }]);
});

test('uses only the additionalFiles from common settings when the per package settings don’t have additional files specified', () => {
    const result = runMapConfig(fooPackageConfigFactory.build(), {
        commonPackageSettings: { additionalFiles: [{ sourceFilePath: 'baz', targetFilePath: 'bar' }] },
        extraPackages: []
    });

    assert.deepStrictEqual(result.additionalFiles, [{ sourceFilePath: 'the-source/baz', targetFilePath: 'bar' }]);
});

test('removes additional files which are duplicated by picking the last one', () => {
    const result = runMapConfig(
        fooPackageWithAdditionalFiles([
            { sourceFilePath: 'foo', targetFilePath: 'bar' },
            { sourceFilePath: 'baz', targetFilePath: 'bar' }
        ]),
        { extraPackages: [] }
    );

    assert.deepStrictEqual(result.additionalFiles, [{ sourceFilePath: 'the-source/baz', targetFilePath: 'bar' }]);
});

test('sets additionalPackageJsonAttributes to an empty object when they are not defined at all', () => {
    const result = runMapConfig(fooPackageConfigFactory.build(), { extraPackages: [] });

    assert.deepStrictEqual(result.additionalPackageJsonAttributes, {});
});

test('sets additionalPackageJsonAttributes to the value of the per package settings', () => {
    const result = runMapConfig(
        { ...fooPackageConfigFactory.build(), additionalPackageJsonAttributes: { foo: 'bar' } },
        { extraPackages: [] }
    );

    assert.deepStrictEqual(result.additionalPackageJsonAttributes, { foo: 'bar' });
});

test('sets additionalPackageJsonAttributes to the value of the common settings', () => {
    const result = runMapConfig(fooPackageConfigFactory.build(), {
        commonPackageSettings: { additionalPackageJsonAttributes: { foo: 'bar' } },
        extraPackages: []
    });

    assert.deepStrictEqual(result.additionalPackageJsonAttributes, { foo: 'bar' });
});

test('defaults moduleResolution to "module" when mainPackageJson.type is not set', () => {
    const result = runMapConfig(fooPackageConfigFactory.build(), { extraPackages: [] });

    assert.strictEqual(result.moduleResolution, 'module');
});

test('uses the module package type as moduleResolution when mainPackageJson.type is set', () => {
    const result = runMapConfig(fooPackageConfigFactory.build({ mainPackageJson: { type: 'module' } }), {
        extraPackages: []
    });

    assert.strictEqual(result.moduleResolution, 'module');
});

test('defaults versioning to automatic when the package config does not specify it', () => {
    const result = runMapConfig(fooPackageConfigFactory.build(), { extraPackages: [] });

    assert.deepStrictEqual(result.versioning, { automatic: true });
});

test('preserves explicit package versioning settings', () => {
    const result = runMapConfig(
        { ...fooPackageConfigFactory.build(), versioning: { automatic: false, version: '2.3.4' } },
        { extraPackages: [] }
    );

    assert.deepStrictEqual(result.versioning, { automatic: false, version: '2.3.4' });
});

test('merges additionalPackageJsonAttributes from per package and common settings', () => {
    const result = runMapConfig(
        { ...fooPackageConfigFactory.build(), additionalPackageJsonAttributes: { baz: 'qux' } },
        {
            commonPackageSettings: { additionalPackageJsonAttributes: { foo: 'bar' } },
            extraPackages: []
        }
    );

    assert.deepStrictEqual(result.additionalPackageJsonAttributes, { foo: 'bar', baz: 'qux' });
});

test('overwrites additionalPackageJsonAttributes from common settings when there are also defined in per package settings', () => {
    const result = runMapConfig(
        { ...fooPackageConfigFactory.build(), additionalPackageJsonAttributes: { foo: 'qux' } },
        {
            commonPackageSettings: { additionalPackageJsonAttributes: { foo: 'bar' } },
            extraPackages: []
        }
    );

    assert.deepStrictEqual(result.additionalPackageJsonAttributes, { foo: 'qux' });
});
