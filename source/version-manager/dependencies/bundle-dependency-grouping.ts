import type { AnalyzedBundle } from '../../dead-code-eliminator/analyzed-bundle.ts';
import type { GroupedDependencies } from './dependency-groups.ts';

export type VersionedDependency = {
    readonly name: string;
    readonly version: string;
};

function findBundleByPackageName(
    bundles: readonly VersionedDependency[],
    name: string
): VersionedDependency | undefined {
    return bundles.find((bundle) => {
        return bundle.name === name;
    });
}

export function groupBundleDependencies(
    bundle: Pick<AnalyzedBundle, 'linkedBundleDependencies'>,
    bundlePeerDependencies: readonly VersionedDependency[],
    bundleDependencies: readonly VersionedDependency[]
): Readonly<GroupedDependencies> {
    const grouped: GroupedDependencies = { dependencies: {}, peerDependencies: {} };
    for (const dependencyName of bundle.linkedBundleDependencies.keys()) {
        const peerBundle = findBundleByPackageName(bundlePeerDependencies, dependencyName);
        if (peerBundle === undefined) {
            const foundBundle = findBundleByPackageName(bundleDependencies, dependencyName);
            if (foundBundle === undefined) {
                throw new Error(`Couldn’t determine version number of bundle dependency ${dependencyName}`);
            }
            grouped.dependencies[dependencyName] = foundBundle.version;
        } else {
            grouped.peerDependencies[dependencyName] = peerBundle.version;
        }
    }
    return grouped;
}
