import type { AnalyzedBundle } from '../dead-code-eliminator/analyzed-bundle.ts';
import { isImplicitPackageSurface } from '../package-surface/surface.ts';
import type { RootFileDescription } from '../resource-resolver/resolved-bundle.ts';

type ExplicitPackageInterfaceLike = {
    readonly modules?: readonly { readonly root: string }[] | undefined;
    readonly bins?: readonly { readonly root: string }[] | undefined;
};

function firstExplicitRootId(packageInterface: ExplicitPackageInterfaceLike): string | undefined {
    const firstModule = packageInterface.modules?.[0];
    if (firstModule !== undefined) {
        return firstModule.root;
    }
    const firstBin = packageInterface.bins?.[0];
    if (firstBin !== undefined) {
        return firstBin.root;
    }
    return undefined;
}

type RepresentativeRootBundle = Pick<AnalyzedBundle, 'name' | 'roots' | 'surface'>;

function resolveRepresentativeRootId(bundle: RepresentativeRootBundle): string {
    if (isImplicitPackageSurface(bundle.surface)) {
        return bundle.surface.defaultModuleRoot;
    }
    const referencedRootId = firstExplicitRootId(bundle.surface.packageInterface);
    if (referencedRootId === undefined) {
        throw new Error(`Package "${bundle.name}" explicit surface declares neither modules nor bins`);
    }
    return referencedRootId;
}

export function resolveRepresentativeRoot(bundle: RepresentativeRootBundle): RootFileDescription {
    const rootId = resolveRepresentativeRootId(bundle);
    // Invariant: buildExportsField (implicit) and buildBinField (explicit) run before this
    // and throw when the referenced root is absent, so the lookup cannot return undefined.
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- see invariant above
    return bundle.roots[rootId]!;
}
