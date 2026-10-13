import { buildExportEntry, type BundleLike, type ExportEntry, type ImplicitSurface } from './package-shape.ts';
import { getRoot } from './root-registry.ts';

type ImplicitRootBundle = Pick<BundleLike, 'name' | 'roots'>;

export function buildImplicitRootExports(
    bundle: ImplicitRootBundle,
    surface: ImplicitSurface
): Record<string, ExportEntry> {
    const rootExports: Record<string, ExportEntry> = {
        '.': buildExportEntry(getRoot(bundle, surface.defaultModuleRoot))
    };

    for (const [ rootIdentifier, root ] of Object.entries(bundle.roots)) {
        if (rootIdentifier !== surface.defaultModuleRoot) {
            rootExports[`./${root.javaScript.targetFilePath}`] = buildExportEntry(root);
        }
    }

    return rootExports;
}
