import type { PackageJson as PackageManifest } from 'type-fest';
import { toImportTarget, type BundleLike, type RootFileDescription } from './package-shape.ts';

type ImplicitExecutableBundle = Pick<BundleLike, 'name' | 'roots'>;

function isShebangContent(content: string): boolean {
    return content.startsWith('#!');
}

function unscopedPackageName(packageName: string): string {
    return packageName.replace(/^@[^/]+\//u, '');
}

function findExecutableShebangRoot(bundle: ImplicitExecutableBundle): RootFileDescription | undefined {
    const executableShebangRoots = Object.values(bundle.roots).filter(function (root) {
        return root.javaScript.isExecutable && isShebangContent(root.javaScript.content);
    });

    if (executableShebangRoots.length > 1) {
        const duplicateShebangRootsMessage = `Package "${bundle.name}" has multiple executable shebang roots; ` +
            'declare packageInterface.executables explicitly';
        throw new Error(duplicateShebangRootsMessage);
    }

    return executableShebangRoots[0];
}

export function buildImplicitExecutableField(bundle: ImplicitExecutableBundle): PackageManifest['bin'] | undefined {
    const root = findExecutableShebangRoot(bundle);
    if (root === undefined) {
        return undefined;
    }

    return { [unscopedPackageName(bundle.name)]: toImportTarget(root.javaScript.targetFilePath) };
}
