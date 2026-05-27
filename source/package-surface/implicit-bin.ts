import type { PackageJson } from 'type-fest';
import { toImportTarget, type BundleLike, type RootFileDescription } from './package-shape.ts';

type ImplicitBinBundle = Pick<BundleLike, 'name' | 'roots'>;

function isShebangContent(content: string): boolean {
    return content.startsWith('#!');
}

function unscopedPackageName(packageName: string): string {
    return packageName.replace(/^@[^/]+\//u, '');
}

function findExecutableShebangRoot(bundle: ImplicitBinBundle): RootFileDescription | undefined {
    const executableShebangRoots = Object.values(bundle.roots).filter((root) => {
        return root.js.isExecutable && isShebangContent(root.js.content);
    });

    if (executableShebangRoots.length > 1) {
        const duplicateShebangRootsMessage =
            `Package "${bundle.name}" has multiple executable shebang roots; ` +
            'declare packageInterface.bins explicitly';
        throw new Error(duplicateShebangRootsMessage);
    }

    return executableShebangRoots[0];
}

export function buildImplicitBinField(bundle: ImplicitBinBundle): PackageJson['bin'] | undefined {
    const root = findExecutableShebangRoot(bundle);
    if (root === undefined) {
        return undefined;
    }

    return { [unscopedPackageName(bundle.name)]: toImportTarget(root.js.targetFilePath) };
}
