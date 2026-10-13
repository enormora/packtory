import type { PackageConfiguration } from '../../configuration/configuration.ts';
import { explicitPackageSurface, implicitPackageSurface, type PackageSurface } from '../../package-surface/surface.ts';
import { getRequiredValue } from './required-value-helpers.ts';

function resolveDefaultModuleRoot(
    rootIdentifiers: readonly [string, ...(readonly string[])],
    packageConfiguration: PackageConfiguration
): string {
    const [ firstRootIdentifier, secondRootIdentifier ] = rootIdentifiers;
    if (secondRootIdentifier === undefined) {
        return firstRootIdentifier;
    }
    return getRequiredValue(
        packageConfiguration.defaultModuleRoot,
        `Config for package "${packageConfiguration.name}" is missing defaultModuleRoot`
    );
}

export function resolveSurface(
    rootIdentifiers: readonly [string, ...(readonly string[])],
    packageConfiguration: PackageConfiguration
): PackageSurface {
    if (packageConfiguration.packageInterface === undefined) {
        return implicitPackageSurface(resolveDefaultModuleRoot(rootIdentifiers, packageConfiguration));
    }
    return explicitPackageSurface(packageConfiguration.packageInterface);
}
