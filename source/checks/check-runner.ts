import type { ChecksSettings, PackageChecksSettings, PackageConfigsByName } from '../config/config.ts';
import type { AnalyzedBundle } from '../dead-code-eliminator/analyzed-bundle.ts';
import type { PublishedPackageWithManifest } from '../published-package/published-package.ts';
import { allRules } from './rules/registry.ts';

export type CheckRunnerParams = {
    readonly bundles: readonly AnalyzedBundle[];
    readonly publishedPackages: ReadonlyMap<string, PublishedPackageWithManifest> | undefined;
    readonly settings: ChecksSettings | undefined;
    readonly perPackageSettings: ReadonlyMap<string, PackageChecksSettings | undefined>;
    readonly packageConfigs: PackageConfigsByName;
};

export async function runChecks(params: CheckRunnerParams): Promise<readonly string[]> {
    const issues = await Promise.all(
        allRules.map(async function (rule) {
            return await rule.run(params);
        })
    );
    return issues.flat();
}
