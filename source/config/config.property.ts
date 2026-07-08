import assert from 'node:assert';
import { safeParse } from '@schema-hub/zod-error-formatter';
import fc from 'fast-check';
import { suite, test } from 'mocha';
import type { LinkedBundle } from '../linker/linked-bundle.ts';
import { configToResolveAndLinkOptions, type ResolveAndLinkOptions } from '../packtory/map-config.ts';
import { linkedBundle } from '../test-libraries/bundle-fixtures.ts';
import type { PackageConfig, PackageConfigsByName, PacktoryConfig } from './config.ts';
import { packtoryConfigSchema } from './packtory-config-schema.ts';
import type { AdditionalPackageJsonAttributes } from './package-json.ts';

const packageNameArbitrary = fc.stringMatching(/^[a-z][\da-z-]{0,7}$/);
const fileNameArbitrary = fc.stringMatching(/^[a-z][\da-z-]{0,7}$/);
const dependencyNameArbitrary = fc.stringMatching(/^[a-z][\da-z-]{0,7}$/);
const additionalAttributeKeyArbitrary = fileNameArbitrary.filter(function (key) {
    return ![
        'dependencies',
        'peerDependencies',
        'devDependencies',
        'main',
        'name',
        'types',
        'type',
        'version'
    ]
        .includes(key);
});

type GeneratedRoot = {
    readonly js: string;
    readonly declarationFile?: string | undefined;
};

type GeneratedConfigInput = {
    readonly packageName: string;
    readonly commonSourcesFolder: string | undefined;
    readonly packageSourcesFolder: string | undefined;
    readonly packageMainType: 'module' | undefined;
    readonly commonMainType: 'module' | undefined;
    readonly commonIncludeSourceMaps: boolean | undefined;
    readonly packageIncludeSourceMaps: boolean | undefined;
    readonly commonAdditionalAttributes: Readonly<Record<string, unknown>>;
    readonly packageAdditionalAttributes: Readonly<Record<string, unknown>>;
    readonly commonAdditionalFileName: string | undefined;
    readonly packageAdditionalFileName: string | undefined;
    readonly entryBaseName: string;
    readonly declarationBaseName: string | undefined;
    readonly dependencyNames: readonly string[];
};

type CommonPackageSettings = NonNullable<PacktoryConfig['commonPackageSettings']>;

function createRoot(jsBaseName: string, declarationBaseName: string | undefined): GeneratedRoot {
    return declarationBaseName === undefined
        ? { js: `${jsBaseName}.js` }
        : { js: `${jsBaseName}.js`, declarationFile: `${declarationBaseName}.d.ts` };
}

function hasEntries(record: Readonly<Record<string, unknown>>): boolean {
    return Object.keys(record).length > 0;
}

function additionalFilesFor(baseName: string | undefined, extension: string): CommonPackageSettings {
    return {
        additionalFiles: baseName === undefined
            ? undefined
            : [
                {
                    sourceFilePath: `${baseName}.${extension}`,
                    targetFilePath: `${baseName}.${extension}`
                }
            ]
    };
}

function additionalAttributesFor(attributes: Readonly<Record<string, unknown>>): CommonPackageSettings {
    return {
        additionalPackageJsonAttributes: hasEntries(attributes)
            ? attributes as AdditionalPackageJsonAttributes
            : undefined
    };
}

function commonPackageSettingsFor(config: GeneratedConfigInput): CommonPackageSettings {
    return {
        sourcesFolder: config.commonSourcesFolder,
        mainPackageJson: config.commonMainType === undefined ? undefined : { type: config.commonMainType },
        includeSourceMapFiles: config.commonIncludeSourceMaps,
        ...additionalFilesFor(config.commonAdditionalFileName, 'txt'),
        ...additionalAttributesFor(config.commonAdditionalAttributes)
    };
}

function packageSettingsFor(config: GeneratedConfigInput): CommonPackageSettings {
    return {
        sourcesFolder: config.packageSourcesFolder,
        mainPackageJson: config.packageMainType === undefined ? undefined : { type: config.packageMainType },
        includeSourceMapFiles: config.packageIncludeSourceMaps,
        ...additionalFilesFor(config.packageAdditionalFileName, 'md'),
        ...additionalAttributesFor(config.packageAdditionalAttributes)
    };
}

function primaryPackageFor(config: GeneratedConfigInput): PackageConfig {
    return {
        name: config.packageName,
        roots: { main: createRoot(config.entryBaseName, config.declarationBaseName) },
        ...packageSettingsFor(config),
        bundleDependencies: config.dependencyNames.length > 0 ? config.dependencyNames : undefined
    };
}

function dependencyPackageFor(config: GeneratedConfigInput, dependencyName: string): PackageConfig {
    return {
        name: dependencyName,
        roots: { main: { js: `${dependencyName}.js` } },
        sourcesFolder: config.commonSourcesFolder ?? config.packageSourcesFolder ?? 'source',
        mainPackageJson: { type: 'module' }
    };
}

function generatedConfigFor(config: GeneratedConfigInput): PacktoryConfig {
    return {
        registrySettings: { auth: { type: 'bearer-token', token: 'token' } },
        commonPackageSettings: commonPackageSettingsFor(config),
        packages: [
            primaryPackageFor(config),
            ...config.dependencyNames.map(function (dependencyName) {
                return dependencyPackageFor(config, dependencyName);
            })
        ]
    };
}

const validConfigArbitrary = fc
    .record({
        packageName: packageNameArbitrary,
        commonSourcesFolder: fc.option(fc.stringMatching(/^[a-z][\d/a-z-]{0,12}$/), { nil: undefined }),
        packageSourcesFolder: fc.option(fc.stringMatching(/^[a-z][\d/a-z-]{0,12}$/), { nil: undefined }),
        packageMainType: fc.option(fc.constant<'module'>('module'), { nil: undefined }),
        commonMainType: fc.option(fc.constant<'module'>('module'), { nil: undefined }),
        commonIncludeSourceMaps: fc.option(fc.boolean(), { nil: undefined }),
        packageIncludeSourceMaps: fc.option(fc.boolean(), { nil: undefined }),
        commonAdditionalAttributes: fc.dictionary(additionalAttributeKeyArbitrary, fc.jsonValue(), { maxKeys: 2 }),
        packageAdditionalAttributes: fc.dictionary(additionalAttributeKeyArbitrary, fc.jsonValue(), { maxKeys: 2 }),
        commonAdditionalFileName: fc.option(fileNameArbitrary, { nil: undefined }),
        packageAdditionalFileName: fc.option(fileNameArbitrary, { nil: undefined }),
        entryBaseName: fileNameArbitrary,
        declarationBaseName: fc.option(fileNameArbitrary, { nil: undefined }),
        dependencyNames: fc.uniqueArray(dependencyNameArbitrary, { maxLength: 2 })
    })
    .filter(function (config: GeneratedConfigInput) {
        return (
            (config.commonSourcesFolder !== undefined || config.packageSourcesFolder !== undefined) &&
            (config.commonMainType !== undefined || config.packageMainType !== undefined) &&
            config.dependencyNames.every(function (dependencyName) {
                return dependencyName !== config.packageName;
            })
        );
    })
    .map(generatedConfigFor);

function namesOf(config: PacktoryConfig): readonly string[] {
    return config.packages.map(function (entry) {
        return entry.name;
    });
}

function rootsOf(config: PacktoryConfig): readonly PackageConfig['roots'][] {
    return config.packages.map(function (entry) {
        return entry.roots;
    });
}

function sourcesFoldersOf(config: PacktoryConfig): readonly (string | undefined)[] {
    return config.packages.map(function (entry) {
        return entry.sourcesFolder;
    });
}

function mainPackageJsonValuesOf(config: PacktoryConfig): readonly PackageConfig['mainPackageJson'][] {
    return config.packages.map(function (entry) {
        return entry.mainPackageJson;
    });
}

function assertParsedConfigMatchesInput(parsedConfig: PacktoryConfig, typedConfig: PacktoryConfig): void {
    assert.deepStrictEqual(
        { registrySettings: parsedConfig.registrySettings, packageCount: parsedConfig.packages.length },
        { registrySettings: typedConfig.registrySettings, packageCount: typedConfig.packages.length }
    );
    assert.deepStrictEqual(namesOf(parsedConfig), namesOf(typedConfig));
    assert.deepStrictEqual(rootsOf(parsedConfig), rootsOf(typedConfig));
    assert.deepStrictEqual(sourcesFoldersOf(parsedConfig), sourcesFoldersOf(typedConfig));
    assert.deepStrictEqual(mainPackageJsonValuesOf(parsedConfig), mainPackageJsonValuesOf(typedConfig));
    assert.deepStrictEqual(
        parsedConfig.commonPackageSettings?.sourcesFolder,
        typedConfig.commonPackageSettings?.sourcesFolder
    );
    assert.deepStrictEqual(
        parsedConfig.commonPackageSettings?.mainPackageJson,
        typedConfig.commonPackageSettings?.mainPackageJson
    );
}

function existingBundlesFor(packageConfig: PackageConfig): readonly LinkedBundle[] {
    return (packageConfig.bundleDependencies ?? []).map(function (dependencyName) {
        return linkedBundle({ name: dependencyName, contents: [] });
    });
}

function packageConfigsByName(config: PacktoryConfig): PackageConfigsByName {
    return Object.fromEntries(
        config.packages.map(function (entry) {
            return [ entry.name, entry ];
        })
    );
}

function assertResolveOptionsMatchConfig(
    result: ResolveAndLinkOptions,
    packageConfig: PackageConfig,
    config: PacktoryConfig
): void {
    const expectedSourcesFolder = packageConfig.sourcesFolder ?? config.commonPackageSettings?.sourcesFolder;
    assert.strictEqual(result.sourcesFolder, expectedSourcesFolder);

    if (packageConfig.mainPackageJson === undefined) {
        assert.deepStrictEqual(result.mainPackageJson, config.commonPackageSettings?.mainPackageJson);
    } else {
        assert.deepStrictEqual(result.mainPackageJson, packageConfig.mainPackageJson);
    }

    if (packageConfig.includeSourceMapFiles !== undefined) {
        assert.strictEqual(result.includeSourceMapFiles, packageConfig.includeSourceMapFiles);
    }
}

suite('config', function () {
    test('packtoryConfigSchema accepts generated valid config shapes unchanged', function () {
        fc.assert(
            fc.property(validConfigArbitrary, function (config) {
                const result = safeParse(packtoryConfigSchema, config);

                if (!result.success) {
                    assert.fail(`Validation failed with: ${result.error.message}`);
                }
                assertParsedConfigMatchesInput(result.data as PacktoryConfig, config);
            })
        );
    });

    test('configToResolveAndLinkOptions() keeps package-specific overrides over inherited common settings', function () {
        fc.assert(
            fc.property(validConfigArbitrary, function (config) {
                const [ packageConfig ] = config.packages;
                if (packageConfig === undefined) {
                    assert.fail('Expected a package configuration');
                }

                const result = configToResolveAndLinkOptions(
                    packageConfig.name,
                    packageConfigsByName(config),
                    config,
                    existingBundlesFor(packageConfig)
                );

                assertResolveOptionsMatchConfig(result, packageConfig, config);
            })
        );
    });
});
