import type { PackageConfig } from '../../config/config.ts';
import { explicitPackageSurface, implicitPackageSurface, type PackageSurface } from '../../package-surface/surface.ts';
import { getRequiredValue } from './required-value-helpers.ts';

function resolveDefaultModuleRoot(
    rootIds: readonly [string, ...(readonly string[])],
    packageConfig: PackageConfig
): string {
    const [ firstRootId, secondRootId ] = rootIds;
    if (secondRootId === undefined) {
        return firstRootId;
    }
    return getRequiredValue(
        packageConfig.defaultModuleRoot,
        `Config for package "${packageConfig.name}" is missing defaultModuleRoot`
    );
}

export function resolveSurface(
    rootIds: readonly [string, ...(readonly string[])],
    packageConfig: PackageConfig
): PackageSurface {
    if (packageConfig.packageInterface === undefined) {
        return implicitPackageSurface(resolveDefaultModuleRoot(rootIds, packageConfig));
    }
    return explicitPackageSurface(packageConfig.packageInterface);
}
