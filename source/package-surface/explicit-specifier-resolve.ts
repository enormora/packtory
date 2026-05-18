import type { BundleLike, ExplicitSurface } from './package-shape.ts';
import { getRoot } from './root-registry.ts';
import { resolveExplicitExportKey } from './specifier-syntax.ts';

type ExplicitResolveBundle = Pick<BundleLike, 'name' | 'roots'>;

export function resolveExplicitPublicModuleSourceFilePath(
    bundle: ExplicitResolveBundle,
    surface: ExplicitSurface,
    specifier: string
): string | undefined {
    const exportKey = resolveExplicitExportKey(bundle.name, specifier);
    if (exportKey === undefined) {
        return undefined;
    }

    const { modules } = surface.packageInterface;
    if (modules === undefined) {
        return undefined;
    }

    const matchingEntry = modules.find((entry) => {
        return entry.export === exportKey;
    });
    return matchingEntry === undefined ? undefined : getRoot(bundle, matchingEntry.root).js.sourceFilePath;
}
