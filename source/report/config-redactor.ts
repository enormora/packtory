import type { PacktoryConfig, PackageConfig } from '../config/config.ts';
import { redactPublishSettings, type RedactedPublishSettings } from '../config/publish-settings.report.ts';
import { redactRegistrySettings, type RedactedRegistrySettings } from '../config/registry-settings.report.ts';

export type RedactedPackageConfig = {
    readonly name: string;
    readonly registrySettings: RedactedRegistrySettings;
    readonly publishSettings?: RedactedPublishSettings;
    readonly sourcesFolder?: string;
};

function findPackageConfig(config: PacktoryConfig, packageName: string): PackageConfig | undefined {
    return config.packages.find((entry) => {
        return entry.name === packageName;
    });
}

function resolvePublishSettings(config: PacktoryConfig, packageName: string): RedactedPublishSettings | undefined {
    const packageConfig = findPackageConfig(config, packageName);
    const resolved = packageConfig?.publishSettings ?? config.commonPackageSettings?.publishSettings;
    return resolved === undefined ? undefined : redactPublishSettings(resolved);
}

function resolveSourcesFolder(config: PacktoryConfig, packageName: string): string | undefined {
    const packageConfig = findPackageConfig(config, packageName);
    return packageConfig?.sourcesFolder ?? config.commonPackageSettings?.sourcesFolder;
}

export function redactConfigForPackage(config: PacktoryConfig, packageName: string): RedactedPackageConfig {
    const publishSettings = resolvePublishSettings(config, packageName);
    const sourcesFolder = resolveSourcesFolder(config, packageName);
    return {
        name: packageName,
        registrySettings: redactRegistrySettings(config.registrySettings),
        ...(publishSettings === undefined ? {} : { publishSettings }),
        ...(sourcesFolder === undefined ? {} : { sourcesFolder })
    };
}
