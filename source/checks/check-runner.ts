import type { ChecksSettings, PackageChecksSettings, PackageConfigsByName } from '../config/config.ts';
import type { AnalyzedBundle } from '../dead-code-eliminator/analyzed-bundle.ts';
import { allRules } from './rules/registry.ts';

export type CheckRunnerParams = {
    readonly bundles: readonly AnalyzedBundle[];
    readonly settings: ChecksSettings | undefined;
    readonly perPackageSettings: ReadonlyMap<string, PackageChecksSettings | undefined>;
    readonly packageConfigs: PackageConfigsByName;
};

export function runChecks(params: CheckRunnerParams): readonly string[] {
    return allRules.flatMap((rule) => {
        return rule.run(params);
    });
}
