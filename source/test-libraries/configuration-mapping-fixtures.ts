import assert from 'node:assert';
import type { PackageConfiguration, PacktoryConfiguration } from '../configuration/configuration.ts';
import {
    configurationToBuildAndPublishOptions,
    type BuildAndPublishOptions,
    type VersionSourceResolver
} from '../packtory/map-configuration.ts';
import type { VersionedBundleWithManifest } from '../version-manager/versioned-bundle.ts';
import {
    fooPackageConfigurationFactory,
    type FooPackageConfigurationShape
} from './configuration-fixtures.ts';

export type RunMapConfigurationOptions = {
    readonly commonPackageSettings?: PacktoryConfiguration['commonPackageSettings'];
    readonly bundleDependencies?: readonly VersionedBundleWithManifest[];
    readonly packageName?: string;
    readonly extraConfiguration?: Partial<PacktoryConfiguration>;
    readonly extraPackages?: readonly PackageConfiguration[];
    readonly resolveVersionSource?: VersionSourceResolver;
};

const placeholderPackage = fooPackageConfigurationFactory.build({ name: '', sourcesFolder: '' });

export function fooPackageWithAdditionalFiles(
    additionalFiles: readonly { readonly inputFilePath: string; readonly targetFilePath: string; }[]
): FooPackageConfigurationShape & {
    readonly additionalFiles: readonly { readonly inputFilePath: string; readonly targetFilePath: string; }[];
} {
    return { ...fooPackageConfigurationFactory.build(), additionalFiles };
}

function packageWithPublishSettingsFallback(
    packageConfiguration: PackageConfiguration,
    commonPackageSettings: PacktoryConfiguration['commonPackageSettings']
): PackageConfiguration {
    if (packageConfiguration.publishSettings !== undefined || commonPackageSettings?.publishSettings !== undefined) {
        return packageConfiguration;
    }
    return {
        publishSettings: { access: 'public' },
        ...packageConfiguration
    };
}

export function runMapConfiguration(
    packageConfiguration: PackageConfiguration,
    options: RunMapConfigurationOptions = {}
): BuildAndPublishOptions {
    const packageName = options.packageName ?? 'foo';
    const additionalPackages = options.extraPackages ?? [ placeholderPackage ];
    const packageWithFallback = packageWithPublishSettingsFallback(packageConfiguration, options.commonPackageSettings);
    const baseConfiguration = {
        registrySettings: { authentication: { type: 'bearer-token', token: 'token' } },
        ...options.extraConfiguration,
        ...options.commonPackageSettings === undefined ? {} : { commonPackageSettings: options.commonPackageSettings },
        packages: [ packageWithFallback, ...additionalPackages ]
    } as unknown as PacktoryConfiguration;
    const packageConfigurations = Object.fromEntries(
        [ packageWithFallback, ...additionalPackages ].map(function (configuredPackage) {
            return [ configuredPackage.name, configuredPackage ];
        })
    );
    return configurationToBuildAndPublishOptions(packageName, packageConfigurations, baseConfiguration, {
        existingBundles: options.bundleDependencies ?? [],
        resolveVersionSource: options.resolveVersionSource
    });
}

export function runMapConfigurationExpectingError(
    packageConfiguration: PackageConfiguration,
    expectedMessage: string,
    options: RunMapConfigurationOptions = {}
): void {
    try {
        runMapConfiguration(packageConfiguration, options);
        assert.fail('Expected configurationToBuildAndPublishOptions() should fail but it did not');
    } catch (error: unknown) {
        assert.strictEqual((error as Error).message, expectedMessage);
    }
}
