import type { PackageConfiguration } from '../../configuration/configuration.ts';
import { explicitPackageSurface, implicitPackageSurface, type PackageSurface } from '../../package-surface/surface.ts';
import { getRequiredValue } from './required-value-helpers.ts';

export function resolveSurface(
    rootIdentifiers: readonly string[],
    packageConfiguration: PackageConfiguration
): PackageSurface {
    if (packageConfiguration.packageInterface !== undefined) {
        return explicitPackageSurface(packageConfiguration.packageInterface);
    }
    const [ firstRootIdentifier, secondRootIdentifier ] = rootIdentifiers;
    if (firstRootIdentifier === undefined) {
        return { mode: 'files' };
    }
    const defaultModuleRoot = secondRootIdentifier === undefined
        ? firstRootIdentifier
        : getRequiredValue(
            packageConfiguration.defaultModuleRoot,
            `Config for package "${packageConfiguration.name}" is missing defaultModuleRoot`
        );
    return implicitPackageSurface(defaultModuleRoot);
}
