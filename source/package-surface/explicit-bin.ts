import type { PackageJson } from 'type-fest';
import { toImportTarget, type BundleLike, type ExplicitSurface, type RootFileDescription } from './package-shape.ts';
import { getRoot } from './root-registry.ts';

type ExplicitBinBundle = Pick<BundleLike, 'name' | 'roots'>;
type BinEntries = NonNullable<ExplicitSurface['packageInterface']['bins']>;

function isShebangContent(content: string): boolean {
    return content.startsWith('#!');
}

function validateShebangRoot(bundleName: string, entryName: string, root: RootFileDescription): RootFileDescription {
    if (!isShebangContent(root.js.content)) {
        throw new Error(`Package "${bundleName}" bin "${entryName}" must point to a root with a shebang`);
    }
    return root;
}

function buildEntries(bundle: ExplicitBinBundle, bins: BinEntries): readonly (readonly [string, string])[] {
    return bins.map(function (entry) {
        const root = validateShebangRoot(bundle.name, entry.name, getRoot(bundle, entry.root));
        return [ entry.name, toImportTarget(root.js.targetFilePath) ];
    });
}

export function buildExplicitBinField(
    bundle: ExplicitBinBundle,
    surface: ExplicitSurface
): PackageJson['bin'] | undefined {
    const { bins } = surface.packageInterface;
    if (bins === undefined) {
        return undefined;
    }
    return Object.fromEntries(buildEntries(bundle, bins));
}
