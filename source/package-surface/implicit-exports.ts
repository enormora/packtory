import { buildImplicitRootExports } from './implicit-root-exports.ts';
import { decorateWithPackageManifestExport } from './package-manifest-export.ts';
import type { BundleLike, ExportEntry, ImplicitSurface } from './package-shape.ts';
import { collectSubstitutionExports } from './substitution-exports.ts';

type ImplicitExportsBundle = Pick<BundleLike, 'contents' | 'exportPackageManifest' | 'name' | 'roots'>;

export function buildImplicitExportsField(
    bundle: ImplicitExportsBundle,
    surface: ImplicitSurface,
    substitutionPublicModuleSourcePaths: ReadonlySet<string>
): Record<string, ExportEntry | string> {
    const merged: Record<string, ExportEntry | string> = {
        ...buildImplicitRootExports(bundle, surface),
        ...collectSubstitutionExports(bundle, substitutionPublicModuleSourcePaths)
    };
    return decorateWithPackageManifestExport(bundle, merged);
}
