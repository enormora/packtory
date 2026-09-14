import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { CollapseRule } from '@pr-log/core';
import type { ChangelogSettings } from '../../config/changelog-settings.ts';
import { createPrLogConfig } from './changelog-pr-log-config.ts';

type VersionChainCollapseRule = Extract<CollapseRule, { readonly fromGroup: string; }>;
type HighestVersionCollapseRule = Extract<CollapseRule, { readonly versionGroup: string; }>;
type SameTitleCollapseRule = Extract<CollapseRule, { readonly collapse: 'same'; }>;

function collectPrLogSettingIssues(settings: ChangelogSettings['prLog']): readonly string[] {
    try {
        createPrLogConfig({ prLog: settings });
        return [];
    } catch (error) {
        assert.ok(error instanceof Error);
        return error.message.split('\n');
    }
}

function isVersionChainCollapseRule(rule: CollapseRule | undefined): rule is VersionChainCollapseRule {
    return rule !== undefined && Object.hasOwn(rule, 'fromGroup') && Object.hasOwn(rule, 'toGroup');
}

function isHighestVersionCollapseRule(rule: CollapseRule | undefined): rule is HighestVersionCollapseRule {
    return rule !== undefined && Object.hasOwn(rule, 'versionGroup');
}

function isSameTitleCollapseRule(rule: CollapseRule | undefined): rule is SameTitleCollapseRule {
    return rule !== undefined && Object.hasOwn(rule, 'collapse');
}

suite('changelog-pr-log-config', function () {
    test('creates pr-log config from defaults and configured settings', function () {
        const prLogConfig = createPrLogConfig({
            prLog: {
                validLabels: { operations: 'Operations' },
                ignoredLabels: [ 'skip-changelog' ],
                versionBumps: { minor: [ 'operations' ] },
                dateFormat: 'yyyy-MM-dd',
                collapseRules: [
                    {
                        label: 'operations',
                        pattern: '^Update (?<dependency>.+?) from (?<from>.+?) to (?<to>.+?)$',
                        replace: 'Update $<dependency> from $<from> to $<to>'
                    }
                ],
                labelLookupIntervalMilliseconds: 500,
                maximumRateLimitRetryCount: 5
            }
        });

        const collapseRule = prLogConfig.collapseRules[0];
        assert.ok(isVersionChainCollapseRule(collapseRule));
        assert.deepStrictEqual(
            {
                bugLabel: prLogConfig.validLabels.get('bug'),
                operationsLabel: prLogConfig.validLabels.get('operations'),
                ignoredLabels: prLogConfig.ignoredLabels,
                versionBumps: prLogConfig.versionBumps,
                dateFormat: prLogConfig.dateFormat,
                collapseRulePatternMatches: collapseRule.pattern.test('Update foo from 1 to 2'),
                collapseRuleKeyGroup: collapseRule.keyGroup,
                collapseRuleFromGroup: collapseRule.fromGroup,
                collapseRuleToGroup: collapseRule.toGroup,
                labelLookupIntervalMilliseconds: prLogConfig.labelLookupIntervalMilliseconds,
                maximumRateLimitRetryCount: prLogConfig.maximumRateLimitRetryCount
            },
            {
                bugLabel: 'Bug Fixes',
                operationsLabel: 'Operations',
                ignoredLabels: [ 'skip-changelog' ],
                versionBumps: { major: [], minor: [ 'operations' ], patch: [] },
                dateFormat: 'yyyy-MM-dd',
                collapseRulePatternMatches: true,
                collapseRuleKeyGroup: 'dependency',
                collapseRuleFromGroup: 'from',
                collapseRuleToGroup: 'to',
                labelLookupIntervalMilliseconds: 500,
                maximumRateLimitRetryCount: 5
            }
        );
    });

    test('creates default version bumps without duplicating major or minor labels into patch', function () {
        const prLogConfig = createPrLogConfig({
            prLog: {
                validLabels: { operations: 'Operations' }
            }
        });

        assert.deepStrictEqual(prLogConfig.versionBumps, {
            major: [ 'breaking' ],
            minor: [ 'feature' ],
            patch: [ 'bug', 'enhancement', 'documentation', 'upgrade', 'refactor', 'build', 'operations' ]
        });
    });

    test('creates empty arrays for omitted configured version bump levels', function () {
        const prLogConfig = createPrLogConfig({
            prLog: {
                versionBumps: { major: [ 'breaking' ] }
            }
        });

        assert.deepStrictEqual(prLogConfig.versionBumps, {
            major: [ 'breaking' ],
            minor: [],
            patch: []
        });
    });

    test('creates default settings when pr-log config is omitted', function () {
        const prLogConfig = createPrLogConfig(undefined);

        assert.deepStrictEqual(
            {
                ignoredLabels: prLogConfig.ignoredLabels,
                dateFormat: prLogConfig.dateFormat,
                collapseRules: prLogConfig.collapseRules,
                labelLookupIntervalMilliseconds: prLogConfig.labelLookupIntervalMilliseconds,
                maximumRateLimitRetryCount: prLogConfig.maximumRateLimitRetryCount
            },
            {
                ignoredLabels: [],
                dateFormat: undefined,
                collapseRules: [],
                labelLookupIntervalMilliseconds: 250,
                maximumRateLimitRetryCount: 3
            }
        );
    });

    test('creates collapse rules with custom groups and unicode matching', function () {
        const prLogConfig = createPrLogConfig({
            prLog: {
                collapseRules: [
                    {
                        label: 'upgrade',
                        pattern: '^(?<name>\\u{E9}) (?<before>.+) (?<after>.+)$',
                        replace: '$<name>',
                        keyGroup: 'name',
                        fromGroup: 'before',
                        toGroup: 'after'
                    },
                    {
                        label: 'upgrade',
                        pattern: '^(?<name>.+) (?<version>.+)$',
                        replace: '$<name>',
                        keyGroup: 'name',
                        versionGroup: 'version'
                    },
                    {
                        label: 'upgrade',
                        pattern: '^(?<name>.+)$',
                        replace: '$<name>',
                        keyGroup: 'name',
                        collapse: 'same'
                    }
                ]
            }
        });

        const versionChainCollapseRule = prLogConfig.collapseRules[0];
        const versionCollapseRule = prLogConfig.collapseRules[1];
        const sameTitleCollapseRule = prLogConfig.collapseRules[2];
        assert.ok(isVersionChainCollapseRule(versionChainCollapseRule));
        assert.ok(isHighestVersionCollapseRule(versionCollapseRule));
        assert.ok(isSameTitleCollapseRule(sameTitleCollapseRule));
        assert.deepStrictEqual(
            {
                flags: versionChainCollapseRule.pattern.flags,
                matchesUnicode: versionChainCollapseRule.pattern.test('\u{E9} 1 2'),
                keyGroup: versionChainCollapseRule.keyGroup,
                fromGroup: versionChainCollapseRule.fromGroup,
                toGroup: versionChainCollapseRule.toGroup,
                versionGroup: versionCollapseRule.versionGroup,
                collapse: sameTitleCollapseRule.collapse
            },
            {
                flags: 'u',
                matchesUnicode: true,
                keyGroup: 'name',
                fromGroup: 'before',
                toGroup: 'after',
                versionGroup: 'version',
                collapse: 'same'
            }
        );
    });

    test('accepts omitted and zero numeric settings', function () {
        assert.deepStrictEqual(collectPrLogSettingIssues(undefined), []);
        assert.deepStrictEqual(collectPrLogSettingIssues({}), []);
        assert.deepStrictEqual(
            collectPrLogSettingIssues({
                collapseRules: undefined,
                labelLookupIntervalMilliseconds: 0,
                maximumRateLimitRetryCount: 0
            }),
            []
        );
    });

    test('reports invalid settings before creating config', function () {
        const settings = {
            validLabels: { operations: 'Operations' },
            versionBumps: { major: [ 'operations' ], minor: [ 'operations' ], patch: [ 'unknown' ] },
            collapseRules: [ { label: 'operations', pattern: '[', replace: 'Update' } ],
            labelLookupIntervalMilliseconds: -1,
            maximumRateLimitRetryCount: 1.5
        } as const;

        const issues = [
            'changelog.prLog.labelLookupIntervalMilliseconds must be a non-negative integer',
            'changelog.prLog.maximumRateLimitRetryCount must be a non-negative integer',
            'changelog.prLog.collapseRules[0].pattern must be a valid regular expression',
            'changelog.prLog.versionBumps.patch label "unknown" must be configured in validLabels',
            'changelog.prLog.versionBumps label "operations" must be unique'
        ];

        assert.deepStrictEqual(collectPrLogSettingIssues(settings), issues);
        assert.throws(function () {
            createPrLogConfig({ prLog: settings });
        }, { message: issues.join('\n') });
    });

    test('reports duplicate version bump labels once in sorted order', function () {
        const issues = collectPrLogSettingIssues({
            versionBumps: {
                major: [ 'feature', 'breaking' ],
                minor: [ 'feature', 'breaking' ],
                patch: [ 'bug', 'bug' ]
            }
        });

        assert.deepStrictEqual(issues, [
            'changelog.prLog.versionBumps label "breaking" must be unique',
            'changelog.prLog.versionBumps label "bug" must be unique',
            'changelog.prLog.versionBumps label "feature" must be unique'
        ]);
    });

    test('reports unicode-only invalid regular expressions', function () {
        assert.deepStrictEqual(
            collectPrLogSettingIssues({
                collapseRules: [
                    {
                        label: 'upgrade',
                        pattern: '\\u{110000}',
                        replace: 'upgrade'
                    }
                ]
            }),
            [ 'changelog.prLog.collapseRules[0].pattern must be a valid regular expression' ]
        );
    });
});
