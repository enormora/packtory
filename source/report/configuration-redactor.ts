import { isDefined, pickBy } from 'remeda';
import type { PacktoryConfiguration, PackageConfiguration } from '../configuration/configuration.ts';
import { redactPublishSettings, type RedactedPublishSettings } from '../configuration/publish-settings.report.ts';
import { redactRegistrySettings, type RedactedRegistrySettings } from '../configuration/registry-settings.report.ts';

export type RedactedPackageConfiguration = {
    readonly name: string;
    readonly registrySettings?: RedactedRegistrySettings;
    readonly publishSettings?: RedactedPublishSettings;
    readonly sourcesFolder?: string;
};

function findPackageConfiguration(
    configuration: PacktoryConfiguration,
    packageName: string
): PackageConfiguration | undefined {
    return configuration.packages.find(function (entry) {
        return entry.name === packageName;
    });
}

function resolvePublishSettings(
    configuration: PacktoryConfiguration,
    packageName: string
): RedactedPublishSettings | undefined {
    const packageConfiguration = findPackageConfiguration(configuration, packageName);
    const resolved = packageConfiguration?.publishSettings ?? configuration.commonPackageSettings?.publishSettings;
    return resolved === undefined ? undefined : redactPublishSettings(resolved);
}

function resolveSourcesFolder(configuration: PacktoryConfiguration, packageName: string): string | undefined {
    const packageConfiguration = findPackageConfiguration(configuration, packageName);
    return packageConfiguration?.sourcesFolder ?? configuration.commonPackageSettings?.sourcesFolder;
}

export function redactConfigurationForPackage(
    configuration: PacktoryConfiguration,
    packageName: string
): RedactedPackageConfiguration {
    const publishSettings = resolvePublishSettings(configuration, packageName);
    const sourcesFolder = resolveSourcesFolder(configuration, packageName);
    return pickBy(
        {
            name: packageName,
            registrySettings: configuration.registrySettings === undefined
                ? undefined
                : redactRegistrySettings(configuration.registrySettings),
            publishSettings,
            sourcesFolder
        },
        isDefined
    );
}
