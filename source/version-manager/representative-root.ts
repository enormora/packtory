import type { AnalyzedBundle } from '../dead-code-eliminator/analyzed-bundle.ts';
import { summarizePackageSurface } from '../package-surface/package-surface-index.ts';
import type { RootFileDescription } from '../resource-resolver/resolved-bundle.ts';

type RepresentativeRootBundle = Pick<AnalyzedBundle, 'name' | 'roots' | 'surface'>;

export function resolveRepresentativeRoot(bundle: RepresentativeRootBundle): RootFileDescription {
    const { representativeRootId } = summarizePackageSurface(bundle);
    const root = bundle.roots[representativeRootId];
    if (root === undefined) {
        throw new Error(`Package "${bundle.name}" references unknown root "${representativeRootId}"`);
    }
    return root;
}
