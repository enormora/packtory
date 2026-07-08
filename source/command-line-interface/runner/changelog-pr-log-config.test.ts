import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { ChangelogSettings } from '../../config/changelog-settings.ts';
import { createPrLogConfig } from './changelog-pr-log-config.ts';

function collectPrLogSettingIssues(settings: ChangelogSettings['prLog']): readonly string[] {
    try {
        createPrLogConfig({ prLog: settings });
        return [];
    } catch (error) {
        assert.ok(error instanceof Error);
        return error.message.split('\n');
    }
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

        assert.deepStrictEqual(
            {
                bugLabel: prLogConfig.validLabels.get('bug'),
                operationsLabel: prLogConfig.validLabels.get('operations'),
                ignoredLabels: prLogConfig.ignoredLabels,
                versionBumps: prLogConfig.versionBumps,
                dateFormat: prLogConfig.dateFormat,
                collapseRulePatternMatches: prLogConfig.collapseRules[0]?.pattern.test('Update foo from 1 to 2'),
                collapseRuleKeyGroup: prLogConfig.collapseRules[0]?.keyGroup,
                collapseRuleFromGroup: prLogConfig.collapseRules[0]?.fromGroup,
                collapseRuleToGroup: prLogConfig.collapseRules[0]?.toGroup,
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
                    }
                ]
            }
        });

        assert.deepStrictEqual(
            {
                flags: prLogConfig.collapseRules[0]?.pattern.flags,
                matchesUnicode: prLogConfig.collapseRules[0]?.pattern.test('\u{E9} 1 2'),
                keyGroup: prLogConfig.collapseRules[0]?.keyGroup,
                fromGroup: prLogConfig.collapseRules[0]?.fromGroup,
                toGroup: prLogConfig.collapseRules[0]?.toGroup
            },
            {
                flags: 'u',
                matchesUnicode: true,
                keyGroup: 'name',
                fromGroup: 'before',
                toGroup: 'after'
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
