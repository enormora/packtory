import { buildImplicitRootExports } from './implicit-root-exports.ts';
import { decorateWithPackageJsonExport } from './package-json-export.ts';
import type { BundleLike, ExportEntry, ImplicitSurface } from './package-shape.ts';
import { collectSubstitutionExports } from './substitution-exports.ts';

type ImplicitExportsBundle = Pick<BundleLike, 'contents' | 'exportPackageJson' | 'name' | 'roots'>;

export function buildImplicitExportsField(
    bundle: ImplicitExportsBundle,
    surface: ImplicitSurface,
    substitutionPublicModuleSourcePaths: ReadonlySet<string>
): Record<string, ExportEntry | string> {
    const merged: Record<string, ExportEntry | string> = {
        ...buildImplicitRootExports(bundle, surface),
        ...collectSubstitutionExports(bundle, substitutionPublicModuleSourcePaths)
    };
    return decorateWithPackageJsonExport(bundle, merged);
}
