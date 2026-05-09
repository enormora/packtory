import type { ChecksSettings, PackageChecksSettings, PackageConfigsByName } from '../config/config.ts';
import type { LinkedBundle } from '../linker/linked-bundle.ts';
import { allRules } from './rules/registry.ts';

export type CheckRunnerParams = {
    readonly bundles: readonly LinkedBundle[];
    readonly settings: ChecksSettings | undefined;
    readonly perPackageSettings: ReadonlyMap<string, PackageChecksSettings | undefined>;
    readonly packageConfigs: PackageConfigsByName;
};

export function runChecks(params: CheckRunnerParams): readonly string[] {
    return allRules.flatMap((rule) => {
        return rule.run(params);
    });
}
