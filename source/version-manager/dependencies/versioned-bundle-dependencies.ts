import type { AnalyzedBundle } from '../../dead-code-eliminator/analyzed-bundle.ts';
import type { MainPackageJson } from '../../config/package-json.ts';
import { groupBundleDependencies, type VersionedDependency } from './bundle-dependency-grouping.ts';
import { mergeDependencyGroups, type GroupedDependencies } from './dependency-groups.ts';
import { groupExternalDependencies } from './external-dependency-classification.ts';

type DependencyDistributionBundle = Pick<AnalyzedBundle, 'externalDependencies' | 'linkedBundleDependencies'>;

type DistributeDependenciesOptions = {
    readonly bundle: DependencyDistributionBundle;
    readonly mainPackageJson: MainPackageJson;
    readonly bundleDependencies: readonly VersionedDependency[];
    readonly bundlePeerDependencies: readonly VersionedDependency[];
    readonly allowMutableSpecifiers: readonly string[];
};

export function distributeDependencies(options: DistributeDependenciesOptions): Readonly<GroupedDependencies> {
    const bundleGrouped = groupBundleDependencies(
        options.bundle,
        options.bundlePeerDependencies,
        options.bundleDependencies
    );
    const externalGrouped = groupExternalDependencies(
        options.bundle,
        options.mainPackageJson,
        options.allowMutableSpecifiers
    );
    return mergeDependencyGroups(bundleGrouped, externalGrouped);
}
