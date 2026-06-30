import { buildExplicitExportsField } from './explicit-exports.ts';
import { buildImplicitExportsField } from './implicit-exports.ts';
import type { BundleLike, ExportsField } from './package-shape.ts';

export function buildExportsField(
    bundle: BundleLike,
    substitutionPublicModuleSourcePaths: ReadonlySet<string>
): ExportsField {
    const record = bundle.surface.mode === 'explicit'
        ? buildExplicitExportsField(bundle, bundle.surface)
        : buildImplicitExportsField(bundle, bundle.surface, substitutionPublicModuleSourcePaths);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- the assembled record conforms to PackageJson exports
    return record as ExportsField;
}
