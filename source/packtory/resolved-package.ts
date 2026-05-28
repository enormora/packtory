import { Result } from 'true-myth';
import { mapToObj } from 'remeda';
import { runChecks } from '../checks/check-runner.ts';
import type { PacktoryConfigWithoutRegistry } from '../config/config.ts';
import type { ConfigWithGraph } from '../config/validation.ts';
import type { AnalyzedBundle } from '../dead-code-eliminator/analyzed-bundle.ts';
import type { PublishedPackageWithManifest } from '../published-package/published-package.ts';
import type { VersionManager } from '../version-manager/manager.ts';
import type { ResolveAndLinkOptions } from './map-config.ts';

export type ResolvedPackage = {
    readonly name: string;
    readonly analyzedBundle: AnalyzedBundle;
    readonly resolveOptions: ResolveAndLinkOptions;
};

export type CheckError = {
    readonly type: 'checks';
    readonly issues: readonly string[];
};

type CheckEvaluationDependencies = {
    readonly versionManager: Pick<VersionManager, 'addVersion'>;
};

const checkManifestVersion = '0.0.0';

export function createResolvedPackage(
    name: string,
    analyzedBundle: AnalyzedBundle,
    resolveOptions: ResolveAndLinkOptions
): ResolvedPackage {
    return { name, analyzedBundle, resolveOptions };
}

function buildPublishedPackagesForChecks(
    dependencies: CheckEvaluationDependencies,
    resolvedPackages: readonly ResolvedPackage[]
): ReadonlyMap<string, PublishedPackageWithManifest> {
    return new Map(
        resolvedPackages.map((resolvedPackage) => {
            const { analyzedBundle, resolveOptions } = resolvedPackage;
            return [
                resolvedPackage.name,
                dependencies.versionManager.addVersion({
                    bundle: analyzedBundle,
                    version: checkManifestVersion,
                    mainPackageJson: resolveOptions.mainPackageJson,
                    bundleDependencies: resolveOptions.bundleDependencies.map((bundleDependency) => {
                        return { name: bundleDependency.name, version: checkManifestVersion };
                    }),
                    bundlePeerDependencies: resolveOptions.bundlePeerDependencies.map((bundleDependency) => {
                        return { name: bundleDependency.name, version: checkManifestVersion };
                    }),
                    additionalPackageJsonAttributes: resolveOptions.additionalPackageJsonAttributes,
                    allowMutableSpecifiers: resolveOptions.allowMutableSpecifiers
                })
            ] as const;
        })
    );
}

function maybeBuildPublishedPackagesForChecks(
    dependencies: CheckEvaluationDependencies,
    config: PacktoryConfigWithoutRegistry,
    resolvedPackages: readonly ResolvedPackage[]
): ReadonlyMap<string, PublishedPackageWithManifest> | undefined {
    return config.checks?.areTheTypesWrong?.enabled === true
        ? buildPublishedPackagesForChecks(dependencies, resolvedPackages)
        : undefined;
}

export async function buildChecksResult(
    dependencies: CheckEvaluationDependencies,
    validated: ConfigWithGraph<PacktoryConfigWithoutRegistry>,
    resolvedPackages: readonly ResolvedPackage[]
): Promise<Result<readonly ResolvedPackage[], CheckError>> {
    const { packtoryConfig: config } = validated;
    const perPackageSettings = new Map<string, (typeof config.packages)[number]['checks']>();
    const commonMainPackageJson = config.commonPackageSettings?.mainPackageJson;
    const effectivePackageConfigs = mapToObj(config.packages, (packageConfig) => {
        perPackageSettings.set(packageConfig.name, packageConfig.checks);

        return [
            packageConfig.name,
            {
                ...packageConfig,
                mainPackageJson: packageConfig.mainPackageJson ?? commonMainPackageJson
            }
        ];
    });
    const bundles = resolvedPackages.map((resolvedPackage) => {
        return resolvedPackage.analyzedBundle;
    });
    const publishedPackages = maybeBuildPublishedPackagesForChecks(dependencies, config, resolvedPackages);
    const checkIssues = await runChecks({
        settings: config.checks ?? {},
        perPackageSettings,
        packageConfigs: effectivePackageConfigs,
        bundles,
        publishedPackages
    });

    if (checkIssues.length > 0) {
        return Result.err({ type: 'checks', issues: checkIssues });
    }

    return Result.ok(resolvedPackages);
}
