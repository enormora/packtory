import { getExplicitPublicModuleSpecifier } from './explicit-specifier-build.ts';
import { resolveExplicitPublicModuleSourceFilePath } from './explicit-specifier-resolve.ts';
import { getImplicitPublicModuleSpecifier } from './implicit-specifier-build.ts';
import { resolveImplicitPublicModuleSourceFilePath } from './implicit-specifier-resolve.ts';
import type { BundleLike } from './package-shape.ts';

export function getPublicModuleSpecifierForSourcePath(bundle: BundleLike, sourceFilePath: string): string | undefined {
    if (bundle.surface.mode === 'explicit') {
        return getExplicitPublicModuleSpecifier(bundle, bundle.surface, sourceFilePath);
    }
    return getImplicitPublicModuleSpecifier(bundle, bundle.surface, sourceFilePath);
}

export function resolvePublicModuleSourceFilePath(bundle: BundleLike, specifier: string): string | undefined {
    if (bundle.surface.mode === 'explicit') {
        return resolveExplicitPublicModuleSourceFilePath(bundle, bundle.surface, specifier);
    }
    return resolveImplicitPublicModuleSourceFilePath(bundle, bundle.surface, specifier);
}
