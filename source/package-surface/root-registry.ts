import type { BundleLike, ExplicitSurface, RootFileDescription } from './package-shape.ts';

export function getRoot(bundle: Pick<BundleLike, 'name' | 'roots'>, rootId: string): RootFileDescription {
    const root = bundle.roots[rootId];
    if (root === undefined) {
        throw new Error(`Package "${bundle.name}" references unknown root "${rootId}"`);
    }
    return root;
}

function collectExplicitPublicRootIds(surface: ExplicitSurface): ReadonlySet<string> {
    const publicRootIds = new Set<string>();
    const moduleEntries = surface.packageInterface.modules ?? [];
    const binEntries = surface.packageInterface.bins ?? [];
    for (const entry of moduleEntries) {
        publicRootIds.add(entry.root);
    }
    for (const entry of binEntries) {
        publicRootIds.add(entry.root);
    }

    return publicRootIds;
}

export function getEntryRootIds(bundle: Pick<BundleLike, 'roots' | 'surface'>): ReadonlySet<string> {
    if (bundle.surface.mode === 'implicit') {
        return new Set(Object.keys(bundle.roots));
    }

    const publicRootIds = collectExplicitPublicRootIds(bundle.surface);
    return new Set([ ...publicRootIds, ...bundle.surface.packageInterface.privateRoots ?? [] ]);
}
