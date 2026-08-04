import type { ChecksSettings, PackageChecksSettings, PackageConfigsByName } from '../config/config.ts';
import type { AnalyzedBundle } from '../dead-code-eliminator/analyzed-bundle.ts';
import type { PublishedPackageWithManifest } from '../published-package/published-package.ts';
import type { AllCheckRules } from './rules/registry.ts';

export type CheckRunnerDependencies = {
    readonly rules: AllCheckRules;
};

type CheckRunnerInput = {
    readonly bundles: readonly AnalyzedBundle[];
    readonly publishedPackages: ReadonlyMap<string, PublishedPackageWithManifest> | undefined;
    readonly settings: ChecksSettings | undefined;
    readonly perPackageSettings: ReadonlyMap<string, PackageChecksSettings | undefined>;
    readonly packageConfigs: PackageConfigsByName;
};

export type CheckRunner = (input: CheckRunnerInput) => Promise<readonly string[]>;

export function createCheckRunner(dependencies: CheckRunnerDependencies): CheckRunner {
    return async function runChecks(input) {
        const issues = await Promise.all(
            dependencies.rules.map(async function (rule) {
                return await rule.run(input);
            })
        );
        return issues.flat();
    };
}
