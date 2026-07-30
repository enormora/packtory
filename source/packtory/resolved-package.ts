import { Result } from 'true-myth';
import { mapToObj } from 'remeda';
import type { CheckRunner } from '../checks/check-runner.ts';
import type { PacktoryConfigWithoutRegistry } from '../config/config.ts';
import type { ConfigWithGraph } from '../config/validation.ts';
import type { AnalyzedBundle } from '../dead-code-eliminator/analyzed-bundle.ts';
import { collectPublicModuleUsage } from '../package-surface/public-module-usage.ts';
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

export type CheckEvaluationDependencies = {
    readonly versionManager: Pick<VersionManager, 'addVersion'>;
    readonly runChecks: CheckRunner;
};

type StaticCheckInputs = Pick<Parameters<CheckRunner>[0], 'bundles' | 'packageConfigs' | 'perPackageSettings'>;

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
    resolvedPackages: readonly ResolvedPackage[],
    publicModuleUsageByName: ReadonlyMap<string, ReadonlySet<string>>
): ReadonlyMap<string, PublishedPackageWithManifest> {
    return new Map(
        resolvedPackages.map(function (resolvedPackage) {
            const { analyzedBundle, resolveOptions } = resolvedPackage;
            const substitutionPublicModuleSourcePaths = publicModuleUsageByName.get(resolvedPackage.name);
            return [
                resolvedPackage.name,
                dependencies.versionManager.addVersion({
                    bundle: analyzedBundle,
                    version: checkManifestVersion,
                    mainPackageJson: resolveOptions.mainPackageJson,
                    bundleDependencies: resolveOptions.bundleDependencies.map(function (bundleDependency) {
                        return { name: bundleDependency.name, version: checkManifestVersion };
                    }),
                    bundlePeerDependencies: resolveOptions.bundlePeerDependencies.map(function (bundleDependency) {
                        return { name: bundleDependency.name, version: checkManifestVersion };
                    }),
                    additionalPackageJsonAttributes: resolveOptions.additionalPackageJsonAttributes,
                    allowMutableSpecifiers: resolveOptions.allowMutableSpecifiers,
                    ...substitutionPublicModuleSourcePaths === undefined
                        ? {}
                        : { substitutionPublicModuleSourcePaths }
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
    return config.checks?.typeScriptIntegrity?.enabled === true
        ? buildPublishedPackagesForChecks(
            dependencies,
            resolvedPackages,
            collectPublicModuleUsage(resolvedPackages.map(function (resolvedPackage) {
                return resolvedPackage.analyzedBundle;
            }))
        )
        : undefined;
}

function checkPackageIssue(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function tryBuildPublishedPackagesForChecks(
    dependencies: CheckEvaluationDependencies,
    config: PacktoryConfigWithoutRegistry,
    resolvedPackages: readonly ResolvedPackage[]
): Result<ReadonlyMap<string, PublishedPackageWithManifest> | undefined, CheckError> {
    try {
        return Result.ok(maybeBuildPublishedPackagesForChecks(dependencies, config, resolvedPackages));
    } catch (error) {
        return Result.err({ type: 'checks', issues: [ checkPackageIssue(error) ] });
    }
}

function createStaticCheckInputs(
    config: PacktoryConfigWithoutRegistry,
    resolvedPackages: readonly ResolvedPackage[]
): StaticCheckInputs {
    const perPackageSettings = new Map<string, (typeof config.packages)[number]['checks']>();
    const commonMainPackageJson = config.commonPackageSettings?.mainPackageJson;
    const packageConfigs = mapToObj(config.packages, function (packageConfig) {
        perPackageSettings.set(packageConfig.name, packageConfig.checks);

        return [
            packageConfig.name,
            {
                ...packageConfig,
                mainPackageJson: packageConfig.mainPackageJson ?? commonMainPackageJson
            }
        ];
    });
    const bundles = resolvedPackages.map(function (resolvedPackage) {
        return resolvedPackage.analyzedBundle;
    });

    return { bundles, packageConfigs, perPackageSettings };
}

export async function buildChecksResult(
    dependencies: CheckEvaluationDependencies,
    validated: ConfigWithGraph<PacktoryConfigWithoutRegistry>,
    resolvedPackages: readonly ResolvedPackage[]
): Promise<Result<readonly ResolvedPackage[], CheckError>> {
    const { packtoryConfig: config } = validated;
    const checkInputs = createStaticCheckInputs(config, resolvedPackages);
    const publishedPackagesResult = tryBuildPublishedPackagesForChecks(dependencies, config, resolvedPackages);
    if (publishedPackagesResult.isErr) {
        return Result.err(publishedPackagesResult.error);
    }
    const checkIssues = await dependencies.runChecks({
        settings: config.checks ?? {},
        perPackageSettings: checkInputs.perPackageSettings,
        packageConfigs: checkInputs.packageConfigs,
        bundles: checkInputs.bundles,
        publishedPackages: publishedPackagesResult.value
    });

    if (checkIssues.length > 0) {
        return Result.err({ type: 'checks', issues: checkIssues });
    }

    return Result.ok(resolvedPackages);
}
