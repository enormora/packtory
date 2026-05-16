import type { PackageInterface } from '../config/package-interface.ts';

export type ImplicitPackageSurface = {
    readonly mode: 'implicit';
    readonly defaultModuleRoot: string;
};

export type ExplicitPackageSurface = {
    readonly mode: 'explicit';
    readonly packageInterface: PackageInterface;
};

export type PackageSurface = ExplicitPackageSurface | ImplicitPackageSurface;

export function implicitPackageSurface(defaultModuleRoot: string): ImplicitPackageSurface {
    return {
        mode: 'implicit',
        defaultModuleRoot
    };
}

export function explicitPackageSurface(packageInterface: PackageInterface): ExplicitPackageSurface {
    return {
        mode: 'explicit',
        packageInterface
    };
}

export function isImplicitPackageSurface(packageSurface: PackageSurface): packageSurface is ImplicitPackageSurface {
    return packageSurface.mode === 'implicit';
}
