import assert from 'node:assert';
import { suite, test } from 'mocha';
import {
    evaluateGitHubReleaseGate,
    selectPullRequestActivityAt,
    type GitHubReleaseGateDecision,
    type GitHubReleaseGateInput,
    type PullRequestActivity,
    type PullRequestTimelineEvent
} from './release-gate.ts';

function createDate(value: string): Date {
    return new Date(value);
}

function pullRequestActivity(overrides: Partial<PullRequestActivity> = {}): PullRequestActivity {
    return {
        activityAt: createDate('2026-05-19T10:20:00.000Z'),
        htmlUrl: 'https://github.com/enormora/packtory/pull/1',
        number: 1,
        ...overrides
    };
}

function timelineEvent(overrides: Partial<PullRequestTimelineEvent> = {}): PullRequestTimelineEvent {
    return {
        createdAt: createDate('2026-05-19T10:10:00.000Z'),
        event: 'committed',
        ...overrides
    };
}

function evaluateGitHubReleaseGateWithBaseInput(
    overrides: Partial<GitHubReleaseGateInput> = {}
): GitHubReleaseGateDecision {
    return evaluateGitHubReleaseGate({
        ciWorkflowFile: 'ci.yml',
        mainBranch: 'main',
        mainCiRunStatus: {
            kind: 'success',
            run: {
                htmlUrl: 'https://github.com/enormora/packtory/actions/runs/1',
                updatedAt: createDate('2026-05-19T11:00:00.000Z')
            }
        },
        mainHeadSha: 'abc123',
        maxLatencyHours: 24,
        now: createDate('2026-05-19T12:00:00.000Z'),
        pullRequestActivities: [],
        quietPeriodMinutes: 45,
        ...overrides
    });
}

function createQuietPeriodDecision(): GitHubReleaseGateDecision {
    return evaluateGitHubReleaseGateWithBaseInput({
        pullRequestActivities: [ pullRequestActivity({ activityAt: createDate('2026-05-19T11:30:00.000Z') }) ]
    });
}

function createBranchActivityTimeline(): readonly PullRequestTimelineEvent[] {
    return [
        timelineEvent({ createdAt: createDate('2026-05-19T10:10:00.000Z'), event: 'head_ref_deleted' }),
        timelineEvent({ createdAt: createDate('2026-05-19T10:20:00.000Z'), event: 'head_ref_force_pushed' }),
        timelineEvent({ createdAt: createDate('2026-05-19T10:30:00.000Z'), event: 'head_ref_restored' })
    ];
}

suite('github-release-gate', function () {
    suite('pull request activity', function () {
        test('selectPullRequestActivityAt treats all branch-activity timeline events as relevant', function () {
            const activityAt = selectPullRequestActivityAt(
                createDate('2026-05-19T09:00:00.000Z'),
                createBranchActivityTimeline()
            );

            assert.deepStrictEqual(activityAt, createDate('2026-05-19T10:30:00.000Z'));
        });

        test('selectPullRequestActivityAt treats head_ref_deleted as branch activity on its own', function () {
            const activityAt = selectPullRequestActivityAt(createDate('2026-05-19T09:00:00.000Z'), [
                timelineEvent({ createdAt: createDate('2026-05-19T10:10:00.000Z'), event: 'head_ref_deleted' }),
                timelineEvent({ createdAt: createDate('2026-05-19T10:30:00.000Z'), event: 'commented' })
            ]);

            assert.deepStrictEqual(activityAt, createDate('2026-05-19T10:10:00.000Z'));
        });

        test('selectPullRequestActivityAt treats head_ref_force_pushed as branch activity on its own', function () {
            const activityAt = selectPullRequestActivityAt(createDate('2026-05-19T09:00:00.000Z'), [
                timelineEvent({ createdAt: createDate('2026-05-19T10:20:00.000Z'), event: 'head_ref_force_pushed' }),
                timelineEvent({ createdAt: createDate('2026-05-19T10:30:00.000Z'), event: 'reviewed' })
            ]);

            assert.deepStrictEqual(activityAt, createDate('2026-05-19T10:20:00.000Z'));
        });

        test('selectPullRequestActivityAt prefers the latest branch activity event over PR creation time', function () {
            const activityAt = selectPullRequestActivityAt(createDate('2026-05-19T09:00:00.000Z'), [
                timelineEvent({ createdAt: createDate('2026-05-19T10:10:00.000Z'), event: 'commented' }),
                timelineEvent({ createdAt: createDate('2026-05-19T10:30:00.000Z'), event: 'committed' }),
                timelineEvent({ createdAt: createDate('2026-05-19T10:25:00.000Z'), event: 'head_ref_force_pushed' })
            ]);

            assert.deepStrictEqual(activityAt, createDate('2026-05-19T10:30:00.000Z'));
        });

        test('selectPullRequestActivityAt falls back to PR creation time when the timeline has no branch activity events', function () {
            const activityAt = selectPullRequestActivityAt(createDate('2026-05-19T11:00:00.000Z'), [
                timelineEvent({ createdAt: createDate('2026-05-19T10:10:00.000Z'), event: 'commented' }),
                timelineEvent({ createdAt: createDate('2026-05-19T10:15:00.000Z'), event: 'reviewed' })
            ]);

            assert.deepStrictEqual(activityAt, createDate('2026-05-19T11:00:00.000Z'));
        });

        test('selectPullRequestActivityAt keeps the PR creation timestamp object when activity ties it', function () {
            const createdAt = createDate('2026-05-19T11:00:00.000Z');
            const activityAt = selectPullRequestActivityAt(createdAt, [
                timelineEvent({ createdAt: createDate('2026-05-19T11:00:00.000Z'), event: 'committed' })
            ]);

            assert.strictEqual(activityAt, createdAt);
        });
    });

    suite('gate decisions', function () {
        test('evaluateGitHubReleaseGate blocks publishing when main HEAD CI is not green', function () {
            const decision = evaluateGitHubReleaseGate({
                ciWorkflowFile: 'ci.yml',
                mainBranch: 'main',
                mainCiRunStatus: { kind: 'missing' },
                mainHeadSha: 'abc123',
                maxLatencyHours: 24,
                now: createDate('2026-05-19T12:00:00.000Z'),
                pullRequestActivities: [],
                quietPeriodMinutes: 45
            });

            assert.deepStrictEqual(decision, {
                shouldPublish: false,
                reason: 'ci_not_green',
                logs: [ 'Skipping publish: no successful ci.yml push run found for main HEAD abc123.' ]
            });
        });

        test('evaluateGitHubReleaseGate blocks publishing while main HEAD CI is still in progress', function () {
            const decision = evaluateGitHubReleaseGate({
                ciWorkflowFile: 'ci.yml',
                mainBranch: 'main',
                mainCiRunStatus: { kind: 'in_progress' },
                mainHeadSha: 'abc123',
                maxLatencyHours: 24,
                now: createDate('2026-05-19T12:00:00.000Z'),
                pullRequestActivities: [],
                quietPeriodMinutes: 45
            });

            assert.deepStrictEqual(decision, {
                shouldPublish: false,
                reason: 'ci_in_progress',
                logs: [ 'Skipping publish: a ci.yml push run is still in progress for main HEAD abc123.' ]
            });
        });

        test('evaluateGitHubReleaseGate blocks publishing while recent PR activity is inside the quiet period', function () {
            const decision = createQuietPeriodDecision();

            assert.partialDeepStrictEqual(decision, {
                shouldPublish: false,
                reason: 'activity_not_stale'
            });
            assert.ok(decision.logs.includes('quiet period elapsed: false'));
            assert.ok(decision.logs.includes('max latency elapsed: false'));
        });

        test('evaluateGitHubReleaseGate includes exact release-context log lines', function () {
            const decision = createQuietPeriodDecision();

            assert.deepStrictEqual(decision.logs, [
                'main HEAD: abc123',
                'main CI success: 2026-05-19T11:00:00.000Z (https://github.com/enormora/packtory/actions/runs/1)',
                'open PRs targeting main: 1',
                'PR #1 activity: 2026-05-19T11:30:00.000Z https://github.com/enormora/packtory/pull/1',
                'last relevant activity: 2026-05-19T11:30:00.000Z',
                'quiet period elapsed: false',
                'max latency elapsed: false',
                'Skipping publish: repository activity is not stale enough yet.'
            ]);
        });

        test('evaluateGitHubReleaseGate allows publishing once the quiet period has elapsed', function () {
            const decision = evaluateGitHubReleaseGateWithBaseInput({
                pullRequestActivities: [ pullRequestActivity({ activityAt: createDate('2026-05-19T10:00:00.000Z') }) ]
            });

            assert.partialDeepStrictEqual(decision, {
                shouldPublish: true,
                reason: 'quiet_period_elapsed'
            });
            assert.strictEqual(decision.logs.at(-1), 'Publishing is allowed by the release gate.');
        });

        test('evaluateGitHubReleaseGate allows publishing when the quiet-period boundary is reached exactly', function () {
            const decision = evaluateGitHubReleaseGateWithBaseInput({
                pullRequestActivities: [ pullRequestActivity({ activityAt: createDate('2026-05-19T11:15:00.000Z') }) ]
            });

            assert.partialDeepStrictEqual(decision, {
                shouldPublish: true,
                reason: 'quiet_period_elapsed'
            });
        });

        test('evaluateGitHubReleaseGate allows publishing once max latency elapses even with fresh PR activity', function () {
            const decision = evaluateGitHubReleaseGateWithBaseInput({
                now: createDate('2026-05-20T12:00:00.000Z'),
                pullRequestActivities: [ pullRequestActivity({ activityAt: createDate('2026-05-20T11:50:00.000Z') }) ]
            });

            assert.partialDeepStrictEqual(decision, {
                shouldPublish: true,
                reason: 'max_latency_elapsed'
            });
            assert.ok(decision.logs.includes('quiet period elapsed: false'));
            assert.ok(decision.logs.includes('max latency elapsed: true'));
        });

        test('evaluateGitHubReleaseGate allows publishing when the max-latency boundary is reached exactly', function () {
            const decision = evaluateGitHubReleaseGateWithBaseInput({
                mainCiRunStatus: {
                    kind: 'success',
                    run: {
                        htmlUrl: 'https://github.com/enormora/packtory/actions/runs/1',
                        updatedAt: createDate('2026-05-19T12:00:00.000Z')
                    }
                },
                now: createDate('2026-05-20T12:00:00.000Z'),
                pullRequestActivities: [ pullRequestActivity({ activityAt: createDate('2026-05-20T11:59:00.000Z') }) ]
            });

            assert.partialDeepStrictEqual(decision, {
                shouldPublish: true,
                reason: 'max_latency_elapsed'
            });
        });
    });
});
