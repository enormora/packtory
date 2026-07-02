import { getSubstitutedResources } from '../../linker/linked-bundle.ts';
import type { ImportRewrite } from '../../progress/progress-broadcaster.ts';

type LinkedBundleLike = {
    readonly contents: readonly {
        readonly fileDescription: { readonly sourceFilePath: string; };
        readonly isSubstituted: boolean;
    }[];
    readonly linkedBundleDependencies: ReadonlyMap<string, unknown>;
};

export function inspectLinkerRewrites(bundle: LinkedBundleLike): readonly ImportRewrite[] {
    const linkedBundleNames = Array.from(bundle.linkedBundleDependencies.keys());
    return getSubstitutedResources(bundle).flatMap(function (resource) {
        return linkedBundleNames.map(function (targetBundle) {
            return {
                file: resource.fileDescription.sourceFilePath,
                fromSpecifier: resource.fileDescription.sourceFilePath,
                toSpecifier: targetBundle,
                targetBundle
            };
        });
    });
}
