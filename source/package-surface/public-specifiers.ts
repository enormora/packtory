import { indexPublicModules } from './package-surface-index.ts';
import type { BundleLike } from './package-shape.ts';

export function getPublicModuleSpecifierForSourcePath(bundle: BundleLike, inputFilePath: string): string | undefined {
    return indexPublicModules(bundle).specifierByInputFilePath.get(inputFilePath);
}
