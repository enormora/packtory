import { Result } from 'true-myth';
import { mapToObj as mapToObject } from 'remeda';
import type { CheckRunner } from '../checks/check-runner.ts';
import type { PacktoryConfigurationWithoutRegistry } from '../configuration/configuration.ts';
import type { ConfigurationWithGraph } from '../configuration/validation.ts';
import type { AnalyzedBundle } from '../dead-code-eliminator/analyzed-bundle.ts';
import { collectPublicModuleUsage } from '../package-surface/public-module-usage.ts';
import type { PublishedPackageWithManifest } from '../published-package/published-package.ts';
import type { VersionManager } from '../version-manager/manager.ts';
import type { ResolveAndLinkOptions } from './map-configuration.ts';

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

type StaticCheckInputs = Pick<
    Parameters<CheckRunner>[0],
    'bundles' | 'packageConfigurations' | 'perPackageSettings' | 'sourceFolders'
>;

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
                    mainPackageManifest: resolveOptions.mainPackageManifest,
                    bundleDependencies: resolveOptions.bundleDependencies.map(function (bundleDependency) {
                        return { name: bundleDependency.name, version: checkManifestVersion };
                    }),
                    bundlePeerDependencies: resolveOptions.bundlePeerDependencies.map(function (bundleDependency) {
                        return { name: bundleDependency.name, version: checkManifestVersion };
                    }),
                    additionalPackageManifestAttributes: resolveOptions.additionalPackageManifestAttributes,
                    allowMutableSpecifiers: resolveOptions.allowMutableSpecifiers,
                    ...substitutionPublicModuleSourcePaths === undefined
                        ? {}
                        : { substitutionPublicModuleSourcePaths }
                })
            ] as const;
        })
    );
}

function typeScriptIntegrityNeedsPublishedPackages(configuration: PacktoryConfigurationWithoutRegistry): boolean {
    return configuration.checks?.typeScriptIntegrity?.enabled === true;
}

function executableChecksNeedPublishedPackages(configuration: PacktoryConfigurationWithoutRegistry): boolean {
    return configuration.checks?.noUnexposedExecutables?.enabled === true;
}

function checksNeedPublishedPackages(configuration: PacktoryConfigurationWithoutRegistry): boolean {
    return typeScriptIntegrityNeedsPublishedPackages(configuration) ||
        executableChecksNeedPublishedPackages(configuration) ||
        configuration.checks?.nodeEngineCompatibility?.enabled === true;
}

function maybeBuildPublishedPackagesForChecks(
    dependencies: CheckEvaluationDependencies,
    configuration: PacktoryConfigurationWithoutRegistry,
    resolvedPackages: readonly ResolvedPackage[]
): ReadonlyMap<string, PublishedPackageWithManifest> | undefined {
    if (!checksNeedPublishedPackages(configuration)) {
        return undefined;
    }

    return buildPublishedPackagesForChecks(
        dependencies,
        resolvedPackages,
        collectPublicModuleUsage(resolvedPackages.map(function (resolvedPackage) {
            return resolvedPackage.analyzedBundle;
        }))
    );
}

function checkPackageIssue(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function tryBuildPublishedPackagesForChecks(
    dependencies: CheckEvaluationDependencies,
    configuration: PacktoryConfigurationWithoutRegistry,
    resolvedPackages: readonly ResolvedPackage[]
): Result<ReadonlyMap<string, PublishedPackageWithManifest> | undefined, CheckError> {
    try {
        return Result.ok(maybeBuildPublishedPackagesForChecks(dependencies, configuration, resolvedPackages));
    } catch (error) {
        return Result.err({ type: 'checks', issues: [ checkPackageIssue(error) ] });
    }
}

function createStaticCheckInputs(
    configuration: PacktoryConfigurationWithoutRegistry,
    resolvedPackages: readonly ResolvedPackage[]
): StaticCheckInputs {
    const perPackageSettings = new Map<string, (typeof configuration.packages)[number]['checks']>();
    const commonMainPackageManifest = configuration.commonPackageSettings?.mainPackageManifest;
    const packageConfigurations = mapToObject(configuration.packages, function (packageConfiguration) {
        perPackageSettings.set(packageConfiguration.name, packageConfiguration.checks);

        return [
            packageConfiguration.name,
            {
                ...packageConfiguration,
                mainPackageManifest: packageConfiguration.mainPackageManifest ?? commonMainPackageManifest
            }
        ];
    });
    const bundles = resolvedPackages.map(function (resolvedPackage) {
        return resolvedPackage.analyzedBundle;
    });

    const sourceFolders = new Map(resolvedPackages.map(function (resolvedPackage) {
        return [ resolvedPackage.name, resolvedPackage.resolveOptions.sourcesFolder ];
    }));
    return { bundles, sourceFolders, packageConfigurations, perPackageSettings };
}

export async function buildChecksResult(
    dependencies: CheckEvaluationDependencies,
    validated: ConfigurationWithGraph<PacktoryConfigurationWithoutRegistry>,
    resolvedPackages: readonly ResolvedPackage[]
): Promise<Result<readonly ResolvedPackage[], CheckError>> {
    const { packtoryConfiguration: configuration } = validated;
    const checkInputs = createStaticCheckInputs(configuration, resolvedPackages);
    const publishedPackagesResult = tryBuildPublishedPackagesForChecks(dependencies, configuration, resolvedPackages);
    if (publishedPackagesResult.isErr) {
        return Result.err(publishedPackagesResult.error);
    }
    const checkIssues = await dependencies.runChecks({
        settings: configuration.checks ?? {},
        perPackageSettings: checkInputs.perPackageSettings,
        packageConfigurations: checkInputs.packageConfigurations,
        bundles: checkInputs.bundles,
        sourceFolders: checkInputs.sourceFolders,
        publishedPackages: publishedPackagesResult.value
    });

    if (checkIssues.length > 0) {
        return Result.err({ type: 'checks', issues: checkIssues });
    }

    return Result.ok(resolvedPackages);
}
