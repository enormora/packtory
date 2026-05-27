import { Result } from 'true-myth';
import { mapToObj } from 'remeda';
import { runChecks } from '../checks/check-runner.ts';
import type { PacktoryConfigWithoutRegistry } from '../config/config.ts';
import type { ConfigWithGraph } from '../config/validation.ts';
import type { AnalyzedBundle } from '../dead-code-eliminator/analyzed-bundle.ts';
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

export function createResolvedPackage(
    name: string,
    analyzedBundle: AnalyzedBundle,
    resolveOptions: ResolveAndLinkOptions
): ResolvedPackage {
    return { name, analyzedBundle, resolveOptions };
}

export function buildChecksResult(
    validated: ConfigWithGraph<PacktoryConfigWithoutRegistry>,
    resolvedPackages: readonly ResolvedPackage[]
): Result<readonly ResolvedPackage[], CheckError> {
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
    const checkIssues = runChecks({
        settings: config.checks ?? {},
        perPackageSettings,
        packageConfigs: effectivePackageConfigs,
        bundles
    });

    if (checkIssues.length > 0) {
        return Result.err({ type: 'checks', issues: checkIssues });
    }

    return Result.ok(resolvedPackages);
}
