import type { PackageJson } from 'type-fest';
import { toImportTarget, type BundleLike, type RootFileDescription } from './package-shape.ts';

type ImplicitBinBundle = Pick<BundleLike, 'name' | 'roots'>;

function isShebangContent(content: string): boolean {
    return content.startsWith('#!');
}

function unscopedPackageName(packageName: string): string {
    return packageName.replace(/^@[^/]+\//u, '');
}

function getExecutableShebangRoots(bundle: Pick<ImplicitBinBundle, 'roots'>): readonly RootFileDescription[] {
    return Object.values(bundle.roots).filter((root) => {
        return root.js.isExecutable && isShebangContent(root.js.content);
    });
}

export function buildImplicitBinField(bundle: ImplicitBinBundle): PackageJson['bin'] | undefined {
    const [root, extraRoot] = getExecutableShebangRoots(bundle);
    if (root === undefined) {
        return undefined;
    }
    if (extraRoot !== undefined) {
        throw new Error(
            `Package "${bundle.name}" has multiple executable shebang roots; declare packageInterface.bins explicitly`
        );
    }
    return { [unscopedPackageName(bundle.name)]: toImportTarget(root.js.targetFilePath) };
}
