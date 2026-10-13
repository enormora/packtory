import type { PacktoryConfigurationWithoutRegistry } from './configuration.ts';

export function validatePublishSettingsArePlaced(
    packtoryConfiguration: Readonly<PacktoryConfigurationWithoutRegistry>
): readonly string[] {
    if (packtoryConfiguration.commonPackageSettings?.publishSettings !== undefined) {
        return [];
    }
    const everyPackageHasIt = packtoryConfiguration.packages.every(function (packageConfiguration) {
        return packageConfiguration.publishSettings !== undefined;
    });
    if (everyPackageHasIt) {
        return [];
    }
    return [ 'publishSettings must be set in commonPackageSettings or in every package' ];
}

export function validateAllowScriptsConsistency(
    packtoryConfiguration: Readonly<PacktoryConfigurationWithoutRegistry>
): readonly string[] {
    const commonAttributes = packtoryConfiguration.commonPackageSettings?.additionalPackageManifestAttributes;
    const commonPublishSettings = packtoryConfiguration.commonPackageSettings?.publishSettings;

    return packtoryConfiguration.packages.flatMap(function (packageConfiguration) {
        const mergedAttributes = { ...commonAttributes, ...packageConfiguration.additionalPackageManifestAttributes };
        const resolvedPublishSettings = packageConfiguration.publishSettings ?? commonPublishSettings;

        if (!Object.hasOwn(mergedAttributes, 'scripts')) {
            return [];
        }
        if (resolvedPublishSettings?.allowScripts === true) {
            return [];
        }
        const prefix = `Package "${packageConfiguration.name}": "scripts" in additionalPackageManifestAttributes`;
        return [ `${prefix} requires "publishSettings.allowScripts: true"` ];
    });
}
