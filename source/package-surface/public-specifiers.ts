import { indexPublicModules } from './package-surface-index.ts';
import type { BundleLike } from './package-shape.ts';

export function getPublicModuleSpecifierForSourcePath(bundle: BundleLike, sourceFilePath: string): string | undefined {
    return indexPublicModules(bundle).specifierBySourceFilePath.get(sourceFilePath);
}

export function resolvePublicModuleSourceFilePath(bundle: BundleLike, specifier: string): string | undefined {
    return indexPublicModules(bundle).sourceFilePathBySpecifier.get(specifier);
}
