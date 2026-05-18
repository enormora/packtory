import { isImplicitPackageSurface } from './surface.ts';
import type { BundleLike, RootFileDescription } from './package-shape.ts';

export function getRoot(bundle: Pick<BundleLike, 'name' | 'roots'>, rootId: string): RootFileDescription {
    const root = bundle.roots[rootId];
    if (root === undefined) {
        throw new Error(`Package "${bundle.name}" references unknown root "${rootId}"`);
    }
    return root;
}

export function isMatchingRootSourcePath(root: RootFileDescription, sourceFilePath: string): boolean {
    if (root.js.sourceFilePath === sourceFilePath) {
        return true;
    }

    return root.declarationFile?.sourceFilePath === sourceFilePath;
}

function getPublicRootIds(bundle: Pick<BundleLike, 'roots' | 'surface'>): ReadonlySet<string> {
    if (isImplicitPackageSurface(bundle.surface)) {
        return new Set(Object.keys(bundle.roots));
    }

    const rootIds = new Set<string>();
    for (const entry of bundle.surface.packageInterface.modules ?? []) {
        rootIds.add(entry.root);
    }
    for (const entry of bundle.surface.packageInterface.bins ?? []) {
        rootIds.add(entry.root);
    }

    return rootIds;
}

export function getEntryRootIds(bundle: Pick<BundleLike, 'roots' | 'surface'>): ReadonlySet<string> {
    const publicRootIds = getPublicRootIds(bundle);
    if (isImplicitPackageSurface(bundle.surface)) {
        return publicRootIds;
    }

    return new Set([...publicRootIds, ...(bundle.surface.packageInterface.privateRoots ?? [])]);
}
