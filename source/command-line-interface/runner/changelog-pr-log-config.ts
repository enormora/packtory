import { defaultPrLogConfig, type CollapseRule, type PrLogConfig } from '@pr-log/core';
import type { ChangelogSettings } from '../../config/changelog-settings.ts';

type PrLogSettings = NonNullable<ChangelogSettings['prLog']>;
type ConfiguredCollapseRule = NonNullable<PrLogSettings['collapseRules']>[number];
type VersionBumpLevel = keyof PrLogConfig['versionBumps'];

const versionBumpLevels: readonly VersionBumpLevel[] = [ 'major', 'minor', 'patch' ];

function createDefaultVersionBumps(validLabels: ReadonlyMap<string, string>): PrLogConfig['versionBumps'] {
    const customPatchLabels = Array
        .from(validLabels.keys())
        .filter(function (label) {
            return !defaultPrLogConfig.validLabels.has(label);
        });
    return {
        major: defaultPrLogConfig.versionBumps.major,
        minor: defaultPrLogConfig.versionBumps.minor,
        patch: [ ...defaultPrLogConfig.versionBumps.patch, ...customPatchLabels ]
    };
}

function createValidLabels(settings: PrLogSettings | undefined): ReadonlyMap<string, string> {
    return new Map([ ...defaultPrLogConfig.validLabels, ...Object.entries(settings?.validLabels ?? {}) ]);
}

function createVersionBumps(
    settings: PrLogSettings | undefined,
    validLabels: ReadonlyMap<string, string>
): PrLogConfig['versionBumps'] {
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
    return {
        label: rule.label,
        pattern: new RegExp(rule.pattern, 'u'),
        replace: rule.replace,
        keyGroup: rule.keyGroup ?? 'dependency',
        fromGroup: rule.fromGroup ?? 'from',
        toGroup: rule.toGroup ?? 'to'
    };
}

function resolveIgnoredLabels(settings: PrLogSettings | undefined): readonly string[] {
    return settings?.ignoredLabels ?? defaultPrLogConfig.ignoredLabels;
}

function resolveDateFormat(settings: PrLogSettings | undefined): string | undefined {
    return settings?.dateFormat ?? defaultPrLogConfig.dateFormat;
}

function resolveCollapseRules(settings: PrLogSettings | undefined): readonly CollapseRule[] {
    return settings?.collapseRules?.map(createCollapseRule) ?? defaultPrLogConfig.collapseRules;
}

function resolveLabelLookupIntervalMilliseconds(settings: PrLogSettings | undefined): number {
    return settings?.labelLookupIntervalMilliseconds ?? defaultPrLogConfig.labelLookupIntervalMilliseconds;
}

function resolveMaximumRateLimitRetryCount(settings: PrLogSettings | undefined): number {
    return settings?.maximumRateLimitRetryCount ?? defaultPrLogConfig.maximumRateLimitRetryCount;
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

function collectInvalidCollapseRuleIssues(rules: PrLogSettings['collapseRules']): readonly string[] {
    if (rules === undefined) {
        return [];
    }
    return rules.flatMap(function (rule, index) {
        const issue = `changelog.prLog.collapseRules[${index}].pattern must be a valid regular expression`;
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

function collectVersionBumpLabels(versionBumps: NonNullable<PrLogSettings['versionBumps']>): readonly string[] {
    return versionBumpLevels.flatMap(function (level) {
        return versionBumps[level] ?? [];
    });
}

function collectInvalidVersionBumpLabelIssues(
    versionBumps: PrLogSettings['versionBumps'],
    validLabels: ReadonlyMap<string, string>
): readonly string[] {
    return versionBumpLevels.flatMap(function (level) {
        return (versionBumps?.[level] ?? []).flatMap(function (label) {
            return validLabels.has(label)
                ? []
                : [ `changelog.prLog.versionBumps.${level} label "${label}" must be configured in validLabels` ];
        });
    });
}

function collectDuplicateVersionBumpLabels(
    versionBumps: NonNullable<PrLogSettings['versionBumps']>
): readonly string[] {
    return collectDuplicateValueIssues(collectVersionBumpLabels(versionBumps));
}

function collectDuplicateVersionBumpLabelIssues(versionBumps: PrLogSettings['versionBumps']): readonly string[] {
    if (versionBumps === undefined) {
        return [];
    }
    return collectDuplicateVersionBumpLabels(versionBumps)
        .map(function (label) {
            return `changelog.prLog.versionBumps label "${label}" must be unique`;
        });
}

function collectPrLogSettingIssues(settings: PrLogSettings | undefined): readonly string[] {
    if (settings === undefined) {
        return [];
    }
    const validLabels = createValidLabels(settings);
    return [
        ...validateNonNegativeInteger(
            settings.labelLookupIntervalMilliseconds,
            'changelog.prLog.labelLookupIntervalMilliseconds'
        ),
        ...validateNonNegativeInteger(
            settings.maximumRateLimitRetryCount,
            'changelog.prLog.maximumRateLimitRetryCount'
        ),
        ...collectInvalidCollapseRuleIssues(settings.collapseRules),
        ...collectInvalidVersionBumpLabelIssues(settings.versionBumps, validLabels),
        ...collectDuplicateVersionBumpLabelIssues(settings.versionBumps)
    ];
}

export function createPrLogConfig(changelog: ChangelogSettings | undefined): PrLogConfig {
    const { prLog } = changelog ?? {};
    const issues = collectPrLogSettingIssues(prLog);
    if (issues.length > 0) {
        throw new Error(issues.join('\n'));
    }
    const validLabels = createValidLabels(prLog);
    return {
        validLabels,
        ignoredLabels: resolveIgnoredLabels(prLog),
        versionBumps: createVersionBumps(prLog, validLabels),
        dateFormat: resolveDateFormat(prLog),
        collapseRules: resolveCollapseRules(prLog),
        labelLookupIntervalMilliseconds: resolveLabelLookupIntervalMilliseconds(prLog),
        maximumRateLimitRetryCount: resolveMaximumRateLimitRetryCount(prLog)
    };
}
