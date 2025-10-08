import type { ChecksSettings } from '../config/config.ts';
import type { CheckContext, CheckRule } from './rule.ts';
import { noDuplicatedFilesRule } from './rules/no-duplicated-files.ts';

export type CheckRunnerParams = CheckContext & {
    readonly settings: ChecksSettings | undefined;
};

const checkRules: readonly CheckRule[] = [noDuplicatedFilesRule];

export function runChecks(params: CheckRunnerParams): readonly string[] {
    const { settings, bundles: packages } = params;

    return checkRules
        .filter((rule) => {
            return rule.isEnabled(settings);
        })
        .flatMap((rule) => {
            return rule.run({ bundles: packages }, settings);
        });
}
