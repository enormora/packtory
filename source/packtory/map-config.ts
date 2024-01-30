import { isSubrecord } from 'effect/ReadonlyRecord';
import type { BundleDescription } from '../bundler/bundle-description.js';
import type { PackageConfig, PacktoryConfig } from '../config/config.js';
import type { MainPackageJson } from '../config/package-json.js';
import type { BuildAndPublishOptions } from '../publisher/publisher.js';

function dependencyNamesToBundles(
    dependencyNames: readonly string[],
    bundles: readonly BundleDescription[]
): readonly BundleDescription[] {
    return dependencyNames.map((dependencyName) => {
        const matchName = isSubrecord<unknown>({ name: dependencyName });
        const bundle = bundles.find(matchName);
        if (bundle === undefined) {
            throw new Error(`Dependent bundle "${dependencyName}" not found`);
        }
        return bundle;
    });
}

export function configToBuildAndPublishOptions(
    packageName: string,
    packageConfigs: Map<string, PackageConfig>,
    packtoryConfig: PacktoryConfig,
    existingBundles: readonly BundleDescription[]
): BuildAndPublishOptions {
    const packageConfig = packageConfigs.get(packageName);
    if (packageConfig === undefined) {
        throw new Error(`Config for package "${packageName}" is missing`);
    }

    const {
        sourcesFolder: sourcesFolderFromPackageConfig,
        mainPackageJson: mainPackageJsonFromPackageConfig,
        bundleDependencies = [],
        bundlePeerDependencies = [],
        ...remainingPackageConfig
    } = packageConfig;
    const mainPackageJson = (packtoryConfig.commonPackageSettings?.mainPackageJson ??
        mainPackageJsonFromPackageConfig) as MainPackageJson;
    const sourcesFolder = (packtoryConfig.commonPackageSettings?.sourcesFolder ??
        sourcesFolderFromPackageConfig) as string;

    return {
        ...remainingPackageConfig,
        registrySettings: packtoryConfig.registrySettings,
        mainPackageJson,
        sourcesFolder,
        bundleDependencies: dependencyNamesToBundles(bundleDependencies, existingBundles),
        bundlePeerDependencies: dependencyNamesToBundles(bundlePeerDependencies, existingBundles)
    };
}