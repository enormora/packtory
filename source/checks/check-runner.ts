import type { ChecksSettings } from '../config/config.ts';
import type { CheckContext } from './rule.ts';
import { isNoDuplicatedFilesRuleEnabled, runNoDuplicatedFilesRule } from './rules/no-duplicated-files.ts';

export type CheckRunnerParams = CheckContext & {
    readonly settings: ChecksSettings | undefined;
};

export function runChecks(params: CheckRunnerParams): readonly string[] {
    const { settings, bundles: packages } = params;

    if (!isNoDuplicatedFilesRuleEnabled(settings)) {
        return [];
    }

    return runNoDuplicatedFilesRule({ bundles: packages }, settings);
}
