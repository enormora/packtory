import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { CollapseRule } from '@pr-log/core';
import type { ChangelogSettings } from '../../configuration/changelog-settings.ts';
import { createPullRequestLogConfiguration } from './changelog-pull-request-log-configuration.ts';

type VersionChainCollapseRule = Extract<CollapseRule, { readonly fromGroup: string; }>;
type HighestVersionCollapseRule = Extract<CollapseRule, { readonly versionGroup: string; }>;
type SameTitleCollapseRule = Extract<CollapseRule, { readonly collapse: 'same'; }>;

function collectPullRequestLogSettingIssues(settings: ChangelogSettings['pullRequestLog']): readonly string[] {
    try {
        createPullRequestLogConfiguration({ pullRequestLog: settings });
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
        const pullRequestLogConfiguration = createPullRequestLogConfiguration({
            pullRequestLog: {
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

        const collapseRule = pullRequestLogConfiguration.collapseRules[0];
        assert.ok(isVersionChainCollapseRule(collapseRule));
        assert.deepStrictEqual(
            {
                bugLabel: pullRequestLogConfiguration.validLabels.get('bug'),
                operationsLabel: pullRequestLogConfiguration.validLabels.get('operations'),
                ignoredLabels: pullRequestLogConfiguration.ignoredLabels,
                versionBumps: pullRequestLogConfiguration.versionBumps,
                dateFormat: pullRequestLogConfiguration.dateFormat,
                collapseRulePatternMatches: collapseRule.pattern.test('Update foo from 1 to 2'),
                collapseRuleKeyGroup: collapseRule.keyGroup,
                collapseRuleFromGroup: collapseRule.fromGroup,
                collapseRuleToGroup: collapseRule.toGroup,
                labelLookupIntervalMilliseconds: pullRequestLogConfiguration.labelLookupIntervalMilliseconds,
                maximumRateLimitRetryCount: pullRequestLogConfiguration.maximumRateLimitRetryCount
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
        const pullRequestLogConfiguration = createPullRequestLogConfiguration({
            pullRequestLog: {
                validLabels: { operations: 'Operations' }
            }
        });

        assert.deepStrictEqual(pullRequestLogConfiguration.versionBumps, {
            major: [ 'breaking' ],
            minor: [ 'feature' ],
            patch: [ 'bug', 'enhancement', 'documentation', 'upgrade', 'refactor', 'build', 'operations' ]
        });
    });

    test('creates empty arrays for omitted configured version bump levels', function () {
        const pullRequestLogConfiguration = createPullRequestLogConfiguration({
            pullRequestLog: {
                versionBumps: { major: [ 'breaking' ] }
            }
        });

        assert.deepStrictEqual(pullRequestLogConfiguration.versionBumps, {
            major: [ 'breaking' ],
            minor: [],
            patch: []
        });
    });

    test('creates default settings when pr-log config is omitted', function () {
        const pullRequestLogConfiguration = createPullRequestLogConfiguration(undefined);

        assert.deepStrictEqual(
            {
                ignoredLabels: pullRequestLogConfiguration.ignoredLabels,
                dateFormat: pullRequestLogConfiguration.dateFormat,
                collapseRules: pullRequestLogConfiguration.collapseRules,
                labelLookupIntervalMilliseconds: pullRequestLogConfiguration.labelLookupIntervalMilliseconds,
                maximumRateLimitRetryCount: pullRequestLogConfiguration.maximumRateLimitRetryCount
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
        const pullRequestLogConfiguration = createPullRequestLogConfiguration({
            pullRequestLog: {
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

        const versionChainCollapseRule = pullRequestLogConfiguration.collapseRules[0];
        const versionCollapseRule = pullRequestLogConfiguration.collapseRules[1];
        const sameTitleCollapseRule = pullRequestLogConfiguration.collapseRules[2];
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
        assert.deepStrictEqual(collectPullRequestLogSettingIssues(undefined), []);
        assert.deepStrictEqual(collectPullRequestLogSettingIssues({}), []);
        assert.deepStrictEqual(
            collectPullRequestLogSettingIssues({
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
            'changelog.pullRequestLog.labelLookupIntervalMilliseconds must be a non-negative integer',
            'changelog.pullRequestLog.maximumRateLimitRetryCount must be a non-negative integer',
            'changelog.pullRequestLog.collapseRules[0].pattern must be a valid regular expression',
            'changelog.pullRequestLog.versionBumps.patch label "unknown" must be configured in validLabels',
            'changelog.pullRequestLog.versionBumps label "operations" must be unique'
        ];

        assert.deepStrictEqual(collectPullRequestLogSettingIssues(settings), issues);
        assert.throws(function () {
            createPullRequestLogConfiguration({ pullRequestLog: settings });
        }, { message: issues.join('\n') });
    });

    test('reports duplicate version bump labels once in sorted order', function () {
        const issues = collectPullRequestLogSettingIssues({
            versionBumps: {
                major: [ 'feature', 'breaking' ],
                minor: [ 'feature', 'breaking' ],
                patch: [ 'bug', 'bug' ]
            }
        });

        assert.deepStrictEqual(issues, [
            'changelog.pullRequestLog.versionBumps label "breaking" must be unique',
            'changelog.pullRequestLog.versionBumps label "bug" must be unique',
            'changelog.pullRequestLog.versionBumps label "feature" must be unique'
        ]);
    });

    test('reports unicode-only invalid regular expressions', function () {
        assert.deepStrictEqual(
            collectPullRequestLogSettingIssues({
                collapseRules: [
                    {
                        label: 'upgrade',
                        pattern: '\\u{110000}',
                        replace: 'upgrade'
                    }
                ]
            }),
            [ 'changelog.pullRequestLog.collapseRules[0].pattern must be a valid regular expression' ]
        );
    });
});
