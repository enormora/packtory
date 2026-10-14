import type { PackageJson as PackageManifest } from 'type-fest';
import { toImportTarget, type BundleLike, type ExplicitSurface, type RootFileDescription } from './package-shape.ts';
import { getRoot } from './root-registry.ts';

type ExplicitExecutableBundle = Pick<BundleLike, 'name' | 'roots'>;
type ExecutableEntries = NonNullable<ExplicitSurface['packageInterface']['executables']>;

function isShebangContent(content: string): boolean {
    return content.startsWith('#!');
}

function validateShebangRoot(bundleName: string, entryName: string, root: RootFileDescription): RootFileDescription {
    if (!isShebangContent(root.javaScript.content)) {
        throw new Error(`Package "${bundleName}" bin "${entryName}" must point to a root with a shebang`);
    }
    return root;
}

function buildEntries(
    bundle: ExplicitExecutableBundle,
    executables: ExecutableEntries
): readonly (readonly [string, string])[] {
    return executables.map(function (entry) {
        const root = validateShebangRoot(bundle.name, entry.name, getRoot(bundle, entry.root));
        return [ entry.name, toImportTarget(root.javaScript.targetFilePath) ];
    });
}

export function buildExplicitExecutableField(
    bundle: ExplicitExecutableBundle,
    surface: ExplicitSurface
): PackageManifest['bin'] | undefined {
    const { executables } = surface.packageInterface;
    if (executables === undefined) {
        return undefined;
    }
    return Object.fromEntries(buildEntries(bundle, executables));
}
