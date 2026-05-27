import type { AnalyzedBundle } from '../../dead-code-eliminator/analyzed-bundle.ts';
import { bundledDependencyGroup, bundledDependencyLookupOrder } from '../../common/bundled-dependency-groups.ts';
import { packageNameMap } from '../../common/package-name-map.ts';
import type { GroupedDependencies } from './dependency-groups.ts';

export type VersionedDependency = {
    readonly name: string;
    readonly version: string;
};

type GroupedDependenciesByName = {
    readonly bundleDependencies: ReadonlyMap<string, VersionedDependency>;
    readonly bundlePeerDependencies: ReadonlyMap<string, VersionedDependency>;
};

type GroupedDependencyMatch = {
    readonly manifestProperty: 'dependencies' | 'peerDependencies';
    readonly version: string;
};

function matchingGroupedDependency(
    groupedDependenciesByName: GroupedDependenciesByName,
    dependencyName: string
): GroupedDependencyMatch | undefined {
    for (const group of bundledDependencyLookupOrder()) {
        const matchingDependency = groupedDependenciesByName[group.propertyName].get(dependencyName);
        if (matchingDependency !== undefined) {
            return { manifestProperty: group.manifestProperty, version: matchingDependency.version };
        }
    }

    return undefined;
}

export function groupBundleDependencies(
    bundle: Pick<AnalyzedBundle, 'linkedBundleDependencies'>,
    bundlePeerDependencies: readonly VersionedDependency[],
    bundleDependencies: readonly VersionedDependency[]
): Readonly<GroupedDependencies> {
    const grouped: GroupedDependencies = { dependencies: {}, peerDependencies: {} };
    const groupedDependenciesByName = {
        [bundledDependencyGroup.bundle.propertyName]: packageNameMap(bundleDependencies),
        [bundledDependencyGroup.peer.propertyName]: packageNameMap(bundlePeerDependencies)
    };

    for (const dependencyName of bundle.linkedBundleDependencies.keys()) {
        const matchingDependency = matchingGroupedDependency(groupedDependenciesByName, dependencyName);
        if (matchingDependency === undefined) {
            throw new Error(`Couldn’t determine version number of bundle dependency ${dependencyName}`);
        }

        grouped[matchingDependency.manifestProperty][dependencyName] = matchingDependency.version;
    }
    return grouped;
}
