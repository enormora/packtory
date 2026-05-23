import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { ReleaseAnalysis } from '../packages/packtory/packtory.entry-point.ts';
import { applyPacktoryReleasePolicy } from './release-policy.ts';
import type { GitHubReleaseGateDecision } from './release-gate.ts';

function baseDecision(overrides: Partial<GitHubReleaseGateDecision & { readonly shouldPublish: true }> = {}) {
    return {
        shouldPublish: true as const,
        reason: 'quiet_period_elapsed' as const,
        logs: ['Publishing is allowed by the release gate.'],
        ...overrides
    };
}

function releaseAnalysis(overrides: Partial<ReleaseAnalysis> = {}): ReleaseAnalysis {
    return {
        classification: 'substantive',
        mostRecentPublishedAt: new Date('2026-05-01T00:00:00.000Z'),
        packageAnalyses: [
            {
                classification: 'substantive',
                latestPublishedAt: new Date('2026-05-01T00:00:00.000Z'),
                latestPublishedVersion: '1.0.0',
                name: 'pkg-a'
            }
        ],
        ...overrides
    };
}

function dependencyOnlyReleaseAnalysis(mostRecentPublishedAt: Date): ReleaseAnalysis {
    return releaseAnalysis({
        classification: 'dependency-only',
        mostRecentPublishedAt,
        packageAnalyses: [
            {
                classification: 'dependency-only',
                latestPublishedAt: mostRecentPublishedAt,
                latestPublishedVersion: '1.0.0',
                name: 'pkg-a'
            }
        ]
    });
}

suite('github-release-gate-release-policy', function () {
    test('keeps the GitHub time-gate decision for substantive releases', function () {
        const decision = applyPacktoryReleasePolicy({
            baseDecision: baseDecision(),
            dependencyOnlyMinAgeDays: 7,
            now: new Date('2026-05-20T00:00:00.000Z'),
            releaseAnalysis: releaseAnalysis()
        });

        assert.strictEqual(decision.shouldPublish, true);
        assert.strictEqual(decision.reason, 'quiet_period_elapsed');
        assert.deepStrictEqual(decision.logs, [
            'Publishing is allowed by the release gate.',
            'release classification: substantive',
            'most recent published package timestamp: 2026-05-01T00:00:00.000Z',
            'package pkg-a: substantive latest=1.0.0 publishedAt=2026-05-01T00:00:00.000Z',
            'Publishing is allowed by the Packtory release policy.'
        ]);
    });

    test('blocks unchanged releases even when the GitHub time gate is open', function () {
        const decision = applyPacktoryReleasePolicy({
            baseDecision: baseDecision(),
            dependencyOnlyMinAgeDays: 7,
            now: new Date('2026-05-20T00:00:00.000Z'),
            releaseAnalysis: releaseAnalysis({
                classification: 'unchanged',
                mostRecentPublishedAt: undefined,
                packageAnalyses: [
                    {
                        classification: 'unchanged',
                        latestPublishedAt: new Date('2026-05-01T00:00:00.000Z'),
                        latestPublishedVersion: '1.0.0',
                        name: 'pkg-a'
                    }
                ]
            })
        });

        assert.strictEqual(decision.shouldPublish, false);
        assert.strictEqual(decision.reason, 'release_unchanged');
        assert.deepStrictEqual(decision.logs, [
            'Publishing is allowed by the release gate.',
            'release classification: unchanged',
            'most recent published package timestamp: (unknown)',
            'package pkg-a: unchanged latest=1.0.0 publishedAt=2026-05-01T00:00:00.000Z',
            'Skipping publish: the next Packtory release would be unchanged versus npm latest.'
        ]);
    });

    test('blocks dependency-only releases until the minimum age elapses', function () {
        const decision = applyPacktoryReleasePolicy({
            baseDecision: baseDecision({ reason: 'max_latency_elapsed' }),
            dependencyOnlyMinAgeDays: 7,
            now: new Date('2026-05-05T00:00:00.000Z'),
            releaseAnalysis: dependencyOnlyReleaseAnalysis(new Date('2026-05-01T00:00:00.000Z'))
        });

        assert.strictEqual(decision.shouldPublish, false);
        assert.strictEqual(decision.reason, 'dependency_only_min_age_not_elapsed');
        assert.strictEqual(
            decision.logs.at(-1),
            'Skipping publish: dependency-only releases must age for at least 7 day(s).'
        );
    });

    test('allows dependency-only releases once the minimum age elapses exactly at the threshold', function () {
        const decision = applyPacktoryReleasePolicy({
            baseDecision: baseDecision(),
            dependencyOnlyMinAgeDays: 7,
            now: new Date('2026-05-08T00:00:00.000Z'),
            releaseAnalysis: dependencyOnlyReleaseAnalysis(new Date('2026-05-01T00:00:00.000Z'))
        });

        assert.strictEqual(decision.shouldPublish, true);
        assert.strictEqual(decision.reason, 'dependency_only_min_age_elapsed');
        assert.strictEqual(
            decision.logs.at(-1),
            'Publishing is allowed because the dependency-only minimum age of 7 day(s) has elapsed.'
        );
    });

    test('allows dependency-only releases immediately when npm does not expose a publish timestamp baseline', function () {
        const decision = applyPacktoryReleasePolicy({
            baseDecision: baseDecision(),
            dependencyOnlyMinAgeDays: 7,
            now: new Date('2026-05-20T00:00:00.000Z'),
            releaseAnalysis: releaseAnalysis({
                classification: 'dependency-only',
                mostRecentPublishedAt: undefined,
                packageAnalyses: [
                    {
                        classification: 'dependency-only',
                        latestPublishedAt: undefined,
                        latestPublishedVersion: '1.0.0',
                        name: 'pkg-a'
                    }
                ]
            })
        });

        assert.strictEqual(decision.shouldPublish, true);
        assert.strictEqual(decision.reason, 'dependency_only_published_at_unknown');
        assert.strictEqual(
            decision.logs.at(-1),
            'Publishing is allowed because this dependency-only release has no publishedAt baseline to delay from.'
        );
    });

    test('logs unpublished package versions as "(unpublished)" when the latest version label is unknown', function () {
        const decision = applyPacktoryReleasePolicy({
            baseDecision: baseDecision(),
            dependencyOnlyMinAgeDays: 7,
            now: new Date('2026-05-20T00:00:00.000Z'),
            releaseAnalysis: releaseAnalysis({
                packageAnalyses: [
                    {
                        classification: 'substantive',
                        latestPublishedAt: undefined,
                        latestPublishedVersion: undefined,
                        name: 'pkg-a'
                    }
                ]
            })
        });

        assert.deepStrictEqual(decision.logs, [
            'Publishing is allowed by the release gate.',
            'release classification: substantive',
            'most recent published package timestamp: 2026-05-01T00:00:00.000Z',
            'package pkg-a: substantive latest=(unpublished) publishedAt=(unknown)',
            'Publishing is allowed by the Packtory release policy.'
        ]);
    });
});
