import { decorateWithPackageJsonExport } from './package-json-export.ts';
import { buildExportEntry, type BundleLike, type ExplicitSurface, type ExportEntry } from './package-shape.ts';
import { getRoot } from './root-registry.ts';

type ExplicitExportsBundle = Pick<BundleLike, 'exportPackageJson' | 'name' | 'roots'>;

function buildEntries(
    bundle: ExplicitExportsBundle,
    surface: ExplicitSurface
): readonly (readonly [string, ExportEntry])[] {
    return (surface.packageInterface.modules ?? []).map((entry) => {
        return [entry.export, buildExportEntry(getRoot(bundle, entry.root))] satisfies [string, ExportEntry];
    });
}

export function buildExplicitExportsField(
    bundle: ExplicitExportsBundle,
    surface: ExplicitSurface
): Record<string, ExportEntry | string> {
    return decorateWithPackageJsonExport(bundle, Object.fromEntries(buildEntries(bundle, surface)));
}
