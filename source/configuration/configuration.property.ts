import assert from 'node:assert';
import { safeParse } from '@schema-hub/zod-error-formatter';
import fastCheck from 'fast-check';
import { suite, test } from 'mocha';
import type { LinkedBundle } from '../linker/linked-bundle.ts';
import { configurationToResolveAndLinkOptions, type ResolveAndLinkOptions } from '../packtory/map-configuration.ts';
import { linkedBundle } from '../test-libraries/bundle-fixtures.ts';
import type { PackageConfiguration, PackageConfigurationsByName, PacktoryConfiguration } from './configuration.ts';
import { packtoryConfigurationSchema } from './packtory-configuration-schema.ts';
import {
    isForbiddenAdditionalPackageManifestAttributeName,
    type AdditionalPackageManifestAttributes
} from './package-manifest.ts';

const packageNameArbitrary = fastCheck.stringMatching(/^[a-z][\da-z-]{0,7}$/);
const fileNameArbitrary = fastCheck.stringMatching(/^[a-z][\da-z-]{0,7}$/);
const dependencyNameArbitrary = fastCheck.stringMatching(/^[a-z][\da-z-]{0,7}$/);
const additionalAttributeKeyArbitrary = fileNameArbitrary.filter(function (key) {
    return !isForbiddenAdditionalPackageManifestAttributeName(key);
});

type GeneratedRoot = {
    readonly javaScript: string;
    readonly declarationFile?: string | undefined;
};

type GeneratedConfigurationInput = {
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

type CommonPackageSettings = NonNullable<PacktoryConfiguration['commonPackageSettings']>;

function createRoot(javaScriptBaseName: string, declarationBaseName: string | undefined): GeneratedRoot {
    return declarationBaseName === undefined
        ? { javaScript: `${javaScriptBaseName}.js` }
        : { javaScript: `${javaScriptBaseName}.js`, declarationFile: `${declarationBaseName}.d.ts` };
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
                    inputFilePath: `${baseName}.${extension}`,
                    targetFilePath: `${baseName}.${extension}`
                }
            ]
    };
}

function additionalAttributesFor(attributes: Readonly<Record<string, unknown>>): CommonPackageSettings {
    return {
        additionalPackageManifestAttributes: hasEntries(attributes)
            ? attributes as AdditionalPackageManifestAttributes
            : undefined
    };
}

function commonPackageSettingsFor(configuration: GeneratedConfigurationInput): CommonPackageSettings {
    return {
        sourcesFolder: configuration.commonSourcesFolder,
        mainPackageManifest: configuration.commonMainType === undefined
            ? undefined
            : { type: configuration.commonMainType },
        includeSourceMapFiles: configuration.commonIncludeSourceMaps,
        ...additionalFilesFor(configuration.commonAdditionalFileName, 'txt'),
        ...additionalAttributesFor(configuration.commonAdditionalAttributes)
    };
}

function packageSettingsFor(configuration: GeneratedConfigurationInput): CommonPackageSettings {
    return {
        sourcesFolder: configuration.packageSourcesFolder,
        mainPackageManifest: configuration.packageMainType === undefined
            ? undefined
            : { type: configuration.packageMainType },
        includeSourceMapFiles: configuration.packageIncludeSourceMaps,
        ...additionalFilesFor(configuration.packageAdditionalFileName, 'md'),
        ...additionalAttributesFor(configuration.packageAdditionalAttributes)
    };
}

function primaryPackageFor(configuration: GeneratedConfigurationInput): PackageConfiguration {
    return {
        name: configuration.packageName,
        roots: { main: createRoot(configuration.entryBaseName, configuration.declarationBaseName) },
        ...packageSettingsFor(configuration),
        bundleDependencies: configuration.dependencyNames.length > 0 ? configuration.dependencyNames : undefined
    };
}

function dependencyPackageFor(
    configuration: GeneratedConfigurationInput,
    dependencyName: string
): PackageConfiguration {
    return {
        name: dependencyName,
        roots: { main: { javaScript: `${dependencyName}.js` } },
        sourcesFolder: configuration.commonSourcesFolder ?? configuration.packageSourcesFolder ?? 'source',
        mainPackageManifest: { type: 'module' }
    };
}

function generatedConfigurationFor(configuration: GeneratedConfigurationInput): PacktoryConfiguration {
    return {
        registrySettings: { authentication: { type: 'bearer-token', token: 'token' } },
        commonPackageSettings: commonPackageSettingsFor(configuration),
        packages: [
            primaryPackageFor(configuration),
            ...configuration.dependencyNames.map(function (dependencyName) {
                return dependencyPackageFor(configuration, dependencyName);
            })
        ]
    };
}

const validConfigurationArbitrary = fastCheck
    .record({
        packageName: packageNameArbitrary,
        commonSourcesFolder: fastCheck.option(fastCheck.stringMatching(/^[a-z][\d/a-z-]{0,12}$/), { nil: undefined }),
        packageSourcesFolder: fastCheck.option(fastCheck.stringMatching(/^[a-z][\d/a-z-]{0,12}$/), { nil: undefined }),
        packageMainType: fastCheck.option(fastCheck.constant<'module'>('module'), { nil: undefined }),
        commonMainType: fastCheck.option(fastCheck.constant<'module'>('module'), { nil: undefined }),
        commonIncludeSourceMaps: fastCheck.option(fastCheck.boolean(), { nil: undefined }),
        packageIncludeSourceMaps: fastCheck.option(fastCheck.boolean(), { nil: undefined }),
        commonAdditionalAttributes: fastCheck.dictionary(additionalAttributeKeyArbitrary, fastCheck.jsonValue(), {
            maxKeys: 2
        }),
        packageAdditionalAttributes: fastCheck.dictionary(additionalAttributeKeyArbitrary, fastCheck.jsonValue(), {
            maxKeys: 2
        }),
        commonAdditionalFileName: fastCheck.option(fileNameArbitrary, { nil: undefined }),
        packageAdditionalFileName: fastCheck.option(fileNameArbitrary, { nil: undefined }),
        entryBaseName: fileNameArbitrary,
        declarationBaseName: fastCheck.option(fileNameArbitrary, { nil: undefined }),
        dependencyNames: fastCheck.uniqueArray(dependencyNameArbitrary, { maxLength: 2 })
    })
    .filter(function (configuration: GeneratedConfigurationInput) {
        return (
            (configuration.commonSourcesFolder !== undefined || configuration.packageSourcesFolder !== undefined) &&
            (configuration.commonMainType !== undefined || configuration.packageMainType !== undefined) &&
            configuration.dependencyNames.every(function (dependencyName) {
                return dependencyName !== configuration.packageName;
            })
        );
    })
    .map(generatedConfigurationFor);

function namesOf(configuration: PacktoryConfiguration): readonly string[] {
    return configuration.packages.map(function (entry) {
        return entry.name;
    });
}

function rootsOf(configuration: PacktoryConfiguration): readonly PackageConfiguration['roots'][] {
    return configuration.packages.map(function (entry) {
        return entry.roots;
    });
}

function sourcesFoldersOf(configuration: PacktoryConfiguration): readonly (string | undefined)[] {
    return configuration.packages.map(function (entry) {
        return entry.sourcesFolder;
    });
}

function mainPackageManifestValuesOf(
    configuration: PacktoryConfiguration
): readonly PackageConfiguration['mainPackageManifest'][] {
    return configuration.packages.map(function (entry) {
        return entry.mainPackageManifest;
    });
}

function assertParsedConfigurationMatchesInput(
    parsedConfiguration: PacktoryConfiguration,
    typedConfiguration: PacktoryConfiguration
): void {
    assert.deepStrictEqual(
        { registrySettings: parsedConfiguration.registrySettings, packageCount: parsedConfiguration.packages.length },
        { registrySettings: typedConfiguration.registrySettings, packageCount: typedConfiguration.packages.length }
    );
    assert.deepStrictEqual(namesOf(parsedConfiguration), namesOf(typedConfiguration));
    assert.deepStrictEqual(rootsOf(parsedConfiguration), rootsOf(typedConfiguration));
    assert.deepStrictEqual(sourcesFoldersOf(parsedConfiguration), sourcesFoldersOf(typedConfiguration));
    assert.deepStrictEqual(
        mainPackageManifestValuesOf(parsedConfiguration),
        mainPackageManifestValuesOf(typedConfiguration)
    );
    assert.deepStrictEqual(
        parsedConfiguration.commonPackageSettings?.sourcesFolder,
        typedConfiguration.commonPackageSettings?.sourcesFolder
    );
    assert.deepStrictEqual(
        parsedConfiguration.commonPackageSettings?.mainPackageManifest,
        typedConfiguration.commonPackageSettings?.mainPackageManifest
    );
}

function existingBundlesFor(packageConfiguration: PackageConfiguration): readonly LinkedBundle[] {
    return (packageConfiguration.bundleDependencies ?? []).map(function (dependencyName) {
        return linkedBundle({ name: dependencyName, contents: [] });
    });
}

function packageConfigurationsByName(configuration: PacktoryConfiguration): PackageConfigurationsByName {
    return Object.fromEntries(
        configuration.packages.map(function (entry) {
            return [ entry.name, entry ];
        })
    );
}

function assertResolveOptionsMatchConfiguration(
    result: ResolveAndLinkOptions,
    packageConfiguration: PackageConfiguration,
    configuration: PacktoryConfiguration
): void {
    const expectedSourcesFolder = packageConfiguration.sourcesFolder ??
        configuration.commonPackageSettings?.sourcesFolder;
    assert.strictEqual(result.sourcesFolder, expectedSourcesFolder);

    if (packageConfiguration.mainPackageManifest === undefined) {
        assert.deepStrictEqual(result.mainPackageManifest, configuration.commonPackageSettings?.mainPackageManifest);
    } else {
        assert.deepStrictEqual(result.mainPackageManifest, packageConfiguration.mainPackageManifest);
    }

    if (packageConfiguration.includeSourceMapFiles !== undefined) {
        assert.strictEqual(result.includeSourceMapFiles, packageConfiguration.includeSourceMapFiles);
    }
}

suite('configuration', function () {
    test('packtoryConfigurationSchema accepts generated valid config shapes unchanged', function () {
        fastCheck.assert(
            fastCheck.property(validConfigurationArbitrary, function (configuration) {
                const result = safeParse(packtoryConfigurationSchema, configuration);

                if (!result.success) {
                    assert.fail(`Validation failed with: ${result.error.message}`);
                }
                assertParsedConfigurationMatchesInput(result.data as PacktoryConfiguration, configuration);
            })
        );
    });

    test('configurationToResolveAndLinkOptions() keeps package-specific overrides over inherited common settings', function () {
        fastCheck.assert(
            fastCheck.property(validConfigurationArbitrary, function (configuration) {
                const [ packageConfiguration ] = configuration.packages;
                if (packageConfiguration === undefined) {
                    assert.fail('Expected a package configuration');
                }

                const result = configurationToResolveAndLinkOptions(
                    packageConfiguration.name,
                    packageConfigurationsByName(configuration),
                    configuration,
                    existingBundlesFor(packageConfiguration)
                );

                assertResolveOptionsMatchConfiguration(result, packageConfiguration, configuration);
            })
        );
    });
});
