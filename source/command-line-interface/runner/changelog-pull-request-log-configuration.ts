import {
    defaultPrLogConfig as defaultPullRequestLogConfiguration,
    type CollapseRule,
    type PrLogConfig as PullRequestLogConfiguration
} from '@pr-log/core';
import type { ChangelogSettings } from '../../configuration/changelog-settings.ts';

type PullRequestLogSettings = NonNullable<ChangelogSettings['pullRequestLog']>;
type ConfiguredCollapseRule = NonNullable<PullRequestLogSettings['collapseRules']>[number];
type VersionBumpLevel = keyof PullRequestLogConfiguration['versionBumps'];

const versionBumpLevels: readonly VersionBumpLevel[] = [ 'major', 'minor', 'patch' ];

function createDefaultVersionBumps(
    validLabels: ReadonlyMap<string, string>
): PullRequestLogConfiguration['versionBumps'] {
    const customPatchLabels = Array
        .from(validLabels.keys())
        .filter(function (label) {
            return !defaultPullRequestLogConfiguration.validLabels.has(label);
        });
    return {
        major: defaultPullRequestLogConfiguration.versionBumps.major,
        minor: defaultPullRequestLogConfiguration.versionBumps.minor,
        patch: [ ...defaultPullRequestLogConfiguration.versionBumps.patch, ...customPatchLabels ]
    };
}

function createValidLabels(settings: PullRequestLogSettings | undefined): ReadonlyMap<string, string> {
    return new Map([
        ...defaultPullRequestLogConfiguration.validLabels,
        ...Object.entries(settings?.validLabels ?? {})
    ]);
}

function createVersionBumps(
    settings: PullRequestLogSettings | undefined,
    validLabels: ReadonlyMap<string, string>
): PullRequestLogConfiguration['versionBumps'] {
    if (settings?.versionBumps === undefined) {
        return createDefaultVersionBumps(validLabels);
    }
    return {
        major: settings.versionBumps.major ?? [],
        minor: settings.versionBumps.minor ?? [],
        patch: settings.versionBumps.patch ?? []
    };
}

function createCollapseRule(rule: ConfiguredCollapseRule): CollapseRule {
    const baseRule = {
        label: rule.label,
        pattern: new RegExp(rule.pattern, 'u'),
        replace: rule.replace,
        keyGroup: rule.keyGroup ?? 'dependency'
    };
    if (rule.collapse === 'same') {
        return {
            ...baseRule,
            collapse: rule.collapse
        };
    }
    if (rule.versionGroup !== undefined) {
        return {
            ...baseRule,
            versionGroup: rule.versionGroup
        };
    }
    return {
        ...baseRule,
        fromGroup: rule.fromGroup ?? 'from',
        toGroup: rule.toGroup ?? 'to'
    };
}

function resolveIgnoredLabels(settings: PullRequestLogSettings | undefined): readonly string[] {
    return settings?.ignoredLabels ?? defaultPullRequestLogConfiguration.ignoredLabels;
}

function resolveDateFormat(settings: PullRequestLogSettings | undefined): string | undefined {
    return settings?.dateFormat ?? defaultPullRequestLogConfiguration.dateFormat;
}

function resolveCollapseRules(settings: PullRequestLogSettings | undefined): readonly CollapseRule[] {
    return settings?.collapseRules?.map(createCollapseRule) ?? defaultPullRequestLogConfiguration.collapseRules;
}

function resolveLabelLookupIntervalMilliseconds(settings: PullRequestLogSettings | undefined): number {
    return settings?.labelLookupIntervalMilliseconds ??
        defaultPullRequestLogConfiguration.labelLookupIntervalMilliseconds;
}

function resolveMaximumRateLimitRetryCount(settings: PullRequestLogSettings | undefined): number {
    return settings?.maximumRateLimitRetryCount ?? defaultPullRequestLogConfiguration.maximumRateLimitRetryCount;
}

function validateNonNegativeInteger(value: number | undefined, settingName: string): readonly string[] {
    if (value === undefined) {
        return [];
    }
    return Number.isSafeInteger(value) && value >= 0 ? [] : [ `${settingName} must be a non-negative integer` ];
}

function isValidRegularExpression(pattern: string): boolean | undefined {
    try {
        const expression = new RegExp(pattern, 'u');
        return expression instanceof RegExp;
    } catch {
        return false;
    }
}

function collectInvalidCollapseRuleIssues(rules: PullRequestLogSettings['collapseRules']): readonly string[] {
    if (rules === undefined) {
        return [];
    }
    return rules.flatMap(function (rule, index) {
        const issue = `changelog.pullRequestLog.collapseRules[${index}].pattern must be a valid regular expression`;
        return isValidRegularExpression(rule.pattern) === false ? [ issue ] : [];
    });
}

function collectDuplicateValueIssues(values: readonly string[]): readonly string[] {
    const seenValues = new Set<string>();
    const duplicatedValues = new Set<string>();

    for (const value of values) {
        if (seenValues.has(value)) {
            duplicatedValues.add(value);
        }
        seenValues.add(value);
    }

    return Array
        .from(duplicatedValues)
        .toSorted(function (left, right) {
            return left.localeCompare(right);
        });
}

function collectVersionBumpLabels(
    versionBumps: NonNullable<PullRequestLogSettings['versionBumps']>
): readonly string[] {
    return versionBumpLevels.flatMap(function (level) {
        return versionBumps[level] ?? [];
    });
}

function collectInvalidVersionBumpLabelIssues(
    versionBumps: PullRequestLogSettings['versionBumps'],
    validLabels: ReadonlyMap<string, string>
): readonly string[] {
    return versionBumpLevels.flatMap(function (level) {
        return (versionBumps?.[level] ?? []).flatMap(function (label) {
            return validLabels.has(label)
                ? []
                : [
                    `changelog.pullRequestLog.versionBumps.${level} label "${label}" must be configured in validLabels`
                ];
        });
    });
}

function collectDuplicateVersionBumpLabels(
    versionBumps: NonNullable<PullRequestLogSettings['versionBumps']>
): readonly string[] {
    return collectDuplicateValueIssues(collectVersionBumpLabels(versionBumps));
}

function collectDuplicateVersionBumpLabelIssues(
    versionBumps: PullRequestLogSettings['versionBumps']
): readonly string[] {
    if (versionBumps === undefined) {
        return [];
    }
    return collectDuplicateVersionBumpLabels(versionBumps)
        .map(function (label) {
            return `changelog.pullRequestLog.versionBumps label "${label}" must be unique`;
        });
}

function collectPullRequestLogSettingIssues(settings: PullRequestLogSettings | undefined): readonly string[] {
    if (settings === undefined) {
        return [];
    }
    const validLabels = createValidLabels(settings);
    return [
        ...validateNonNegativeInteger(
            settings.labelLookupIntervalMilliseconds,
            'changelog.pullRequestLog.labelLookupIntervalMilliseconds'
        ),
        ...validateNonNegativeInteger(
            settings.maximumRateLimitRetryCount,
            'changelog.pullRequestLog.maximumRateLimitRetryCount'
        ),
        ...collectInvalidCollapseRuleIssues(settings.collapseRules),
        ...collectInvalidVersionBumpLabelIssues(settings.versionBumps, validLabels),
        ...collectDuplicateVersionBumpLabelIssues(settings.versionBumps)
    ];
}

export function createPullRequestLogConfiguration(
    changelog: ChangelogSettings | undefined
): PullRequestLogConfiguration {
    const { pullRequestLog } = changelog ?? {};
    const issues = collectPullRequestLogSettingIssues(pullRequestLog);
    if (issues.length > 0) {
        throw new Error(issues.join('\n'));
    }
    const validLabels = createValidLabels(pullRequestLog);
    return {
        validLabels,
        ignoredLabels: resolveIgnoredLabels(pullRequestLog),
        versionBumps: createVersionBumps(pullRequestLog, validLabels),
        dateFormat: resolveDateFormat(pullRequestLog),
        collapseRules: resolveCollapseRules(pullRequestLog),
        labelLookupIntervalMilliseconds: resolveLabelLookupIntervalMilliseconds(pullRequestLog),
        maximumRateLimitRetryCount: resolveMaximumRateLimitRetryCount(pullRequestLog)
    };
}
