import type { PacktoryConfigWithoutRegistry } from './config.ts';

export function validatePublishSettingsArePlaced(
    packtoryConfig: Readonly<PacktoryConfigWithoutRegistry>
): readonly string[] {
    if (packtoryConfig.commonPackageSettings?.publishSettings !== undefined) {
        return [];
    }
    const everyPackageHasIt = packtoryConfig.packages.every((packageConfig) => {
        return packageConfig.publishSettings !== undefined;
    });
    if (everyPackageHasIt) {
        return [];
    }
    return ['publishSettings must be set in commonPackageSettings or in every package'];
}

export function validateAllowScriptsConsistency(
    packtoryConfig: Readonly<PacktoryConfigWithoutRegistry>
): readonly string[] {
    const commonAttributes = packtoryConfig.commonPackageSettings?.additionalPackageJsonAttributes;
    const commonPublishSettings = packtoryConfig.commonPackageSettings?.publishSettings;

    return packtoryConfig.packages.flatMap((packageConfig) => {
        const mergedAttributes = { ...commonAttributes, ...packageConfig.additionalPackageJsonAttributes };
        const resolvedPublishSettings = packageConfig.publishSettings ?? commonPublishSettings;

        if (!('scripts' in mergedAttributes)) {
            return [];
        }
        if (resolvedPublishSettings?.allowScripts === true) {
            return [];
        }
        const prefix = `Package "${packageConfig.name}": "scripts" in additionalPackageJsonAttributes`;
        return [`${prefix} requires "publishSettings.allowScripts: true"`];
    });
}
