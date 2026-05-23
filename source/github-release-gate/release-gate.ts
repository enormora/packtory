import { maxDate } from '../common/max-date.ts';

export type PullRequestTimelineEvent = {
    readonly createdAt: Date;
    readonly event: string;
};

export type PullRequestActivity = {
    readonly activityAt: Date;
    readonly htmlUrl: string;
    readonly number: number;
};

export type SuccessfulMainCiRun = {
    readonly htmlUrl: string;
    readonly updatedAt: Date;
};

export type GitHubReleaseGateDecision = {
    readonly logs: readonly string[];
    readonly reason:
        | 'activity_not_stale'
        | 'ci_not_green'
        | 'dependency_only_min_age_elapsed'
        | 'dependency_only_min_age_not_elapsed'
        | 'dependency_only_published_at_unknown'
        | 'max_latency_elapsed'
        | 'quiet_period_elapsed'
        | 'release_unchanged';
    readonly shouldPublish: boolean;
};

export type GitHubReleaseGateInput = {
    readonly ciWorkflowFile: string;
    readonly mainBranch: string;
    readonly mainHeadSha: string;
    readonly maxLatencyHours: number;
    readonly now: Date;
    readonly pullRequestActivities: readonly PullRequestActivity[];
    readonly quietPeriodMinutes: number;
    readonly successfulMainCiRun: SuccessfulMainCiRun | undefined;
};

const branchActivityEvents = new Set(['committed', 'head_ref_deleted', 'head_ref_force_pushed', 'head_ref_restored']);
const millisecondsPerSecond = 1000;
const minutesPerHour = 60;
const secondsPerMinute = 60;

type DecisionLogContext = {
    readonly input: GitHubReleaseGateInput;
    readonly lastRelevantActivityAt: Date;
    readonly mainHeadCiSuccessAt: Date;
    readonly mainHeadCiSuccessHtmlUrl: string;
    readonly maxLatencyElapsed: boolean;
    readonly quietPeriodElapsed: boolean;
};

function createMainCiSuccessLog(context: DecisionLogContext): string {
    return `main CI success: ${context.mainHeadCiSuccessAt.toISOString()} (${context.mainHeadCiSuccessHtmlUrl})`;
}

function buildDecisionLogs(context: DecisionLogContext): readonly string[] {
    return [
        `main HEAD: ${context.input.mainHeadSha}`,
        createMainCiSuccessLog(context),
        `open PRs targeting ${context.input.mainBranch}: ${context.input.pullRequestActivities.length}`,
        ...context.input.pullRequestActivities.map((pullRequestActivity) => {
            return (
                `PR #${pullRequestActivity.number} activity: ` +
                `${pullRequestActivity.activityAt.toISOString()} ${pullRequestActivity.htmlUrl}`
            );
        }),
        `last relevant activity: ${context.lastRelevantActivityAt.toISOString()}`,
        `quiet period elapsed: ${context.quietPeriodElapsed}`,
        `max latency elapsed: ${context.maxLatencyElapsed}`
    ];
}

function createMissingCiDecision(input: GitHubReleaseGateInput): GitHubReleaseGateDecision {
    const missingCiLog =
        `Skipping publish: no successful ${input.ciWorkflowFile} push run found for ${input.mainBranch} ` +
        `HEAD ${input.mainHeadSha}.`;

    return {
        shouldPublish: false,
        reason: 'ci_not_green',
        logs: [missingCiLog]
    };
}

function getElapsedFlags(
    input: GitHubReleaseGateInput,
    mainHeadCiSuccessAt: Date,
    lastRelevantActivityAt: Date
): {
    readonly maxLatencyElapsed: boolean;
    readonly quietPeriodElapsed: boolean;
} {
    return {
        quietPeriodElapsed:
            input.now.getTime() - lastRelevantActivityAt.getTime() >=
            input.quietPeriodMinutes * secondsPerMinute * millisecondsPerSecond,
        maxLatencyElapsed:
            input.now.getTime() - mainHeadCiSuccessAt.getTime() >=
            input.maxLatencyHours * minutesPerHour * secondsPerMinute * millisecondsPerSecond
    };
}

export function selectPullRequestActivityAt(
    pullRequestCreatedAt: Date,
    timelineEvents: readonly PullRequestTimelineEvent[]
): Date {
    const branchActivityDates = timelineEvents.flatMap((event) => {
        return branchActivityEvents.has(event.event) ? [event.createdAt] : [];
    });

    return maxDate(pullRequestCreatedAt, branchActivityDates);
}

export function evaluateGitHubReleaseGate(input: GitHubReleaseGateInput): GitHubReleaseGateDecision {
    if (input.successfulMainCiRun === undefined) {
        return createMissingCiDecision(input);
    }

    const mainHeadCiSuccessAt = input.successfulMainCiRun.updatedAt;
    const otherActivityDates = input.pullRequestActivities.map((pullRequestActivity) => {
        return pullRequestActivity.activityAt;
    });
    const lastRelevantActivityAt = maxDate(mainHeadCiSuccessAt, otherActivityDates);
    const { quietPeriodElapsed, maxLatencyElapsed } = getElapsedFlags(
        input,
        mainHeadCiSuccessAt,
        lastRelevantActivityAt
    );
    const logs = buildDecisionLogs({
        input,
        mainHeadCiSuccessAt,
        mainHeadCiSuccessHtmlUrl: input.successfulMainCiRun.htmlUrl,
        lastRelevantActivityAt,
        quietPeriodElapsed,
        maxLatencyElapsed
    });

    if (!quietPeriodElapsed && !maxLatencyElapsed) {
        return {
            shouldPublish: false,
            reason: 'activity_not_stale',
            logs: [...logs, 'Skipping publish: repository activity is not stale enough yet.']
        };
    }

    return {
        shouldPublish: true,
        reason: quietPeriodElapsed ? 'quiet_period_elapsed' : 'max_latency_elapsed',
        logs: [...logs, 'Publishing is allowed by the release gate.']
    };
}
