import { maxDate } from '../common/max-date.ts';

export type PullRequestTimelineEvent = {
    readonly createdAt: Date;
    readonly event?: string | undefined;
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

const millisecondsPerMinute = 60_000;
const millisecondsPerHour = 3_600_000;

type DecisionLogContext = {
    readonly input: GitHubReleaseGateInput;
    readonly lastRelevantActivityAt: Date;
    readonly mainHeadCiSuccessAt: Date;
    readonly mainHeadCiSuccessHtmlUrl: string;
    readonly maxLatencyElapsed: boolean;
    readonly quietPeriodElapsed: boolean;
};

function createDecision(
    shouldPublish: boolean,
    reason: GitHubReleaseGateDecision['reason'],
    logs: readonly string[],
    decisionLog: string
): GitHubReleaseGateDecision {
    return {
        shouldPublish,
        reason,
        logs: [...logs, decisionLog]
    };
}

function createMainCiSuccessLog(context: DecisionLogContext): string {
    return `main CI success: ${context.mainHeadCiSuccessAt.toISOString()} (${context.mainHeadCiSuccessHtmlUrl})`;
}

function buildDecisionLogs(context: DecisionLogContext): readonly string[] {
    const logs = [
        `main HEAD: ${context.input.mainHeadSha}`,
        createMainCiSuccessLog(context),
        `open PRs targeting ${context.input.mainBranch}: ${context.input.pullRequestActivities.length}`
    ];

    for (const pullRequestActivity of context.input.pullRequestActivities) {
        const activityAt = pullRequestActivity.activityAt.toISOString();
        logs.push(`PR #${pullRequestActivity.number} activity: ${activityAt} ${pullRequestActivity.htmlUrl}`);
    }

    logs.push(
        `last relevant activity: ${context.lastRelevantActivityAt.toISOString()}`,
        `quiet period elapsed: ${context.quietPeriodElapsed}`,
        `max latency elapsed: ${context.maxLatencyElapsed}`
    );

    return logs;
}

function createMissingCiDecision(input: GitHubReleaseGateInput): GitHubReleaseGateDecision {
    const missingCiLog =
        `Skipping publish: no successful ${input.ciWorkflowFile} push run found for ${input.mainBranch} ` +
        `HEAD ${input.mainHeadSha}.`;

    return createDecision(false, 'ci_not_green', [], missingCiLog);
}

function hasElapsed(now: Date, since: Date, elapsedMilliseconds: number): boolean {
    return now.getTime() - since.getTime() >= elapsedMilliseconds;
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
        quietPeriodElapsed: hasElapsed(
            input.now,
            lastRelevantActivityAt,
            input.quietPeriodMinutes * millisecondsPerMinute
        ),
        maxLatencyElapsed: hasElapsed(input.now, mainHeadCiSuccessAt, input.maxLatencyHours * millisecondsPerHour)
    };
}

function isBranchActivityEvent(eventName: string | undefined): boolean {
    const activityEventName = String(eventName);
    return (
        activityEventName === 'committed' ||
        activityEventName === 'head_ref_deleted' ||
        activityEventName === 'head_ref_force_pushed' ||
        activityEventName === 'head_ref_restored'
    );
}

function lastRelevantActivityAtFor(input: GitHubReleaseGateInput, mainHeadCiSuccessAt: Date): Date {
    const otherActivityDates: Date[] = [];

    for (const pullRequestActivity of input.pullRequestActivities) {
        otherActivityDates.push(pullRequestActivity.activityAt);
    }

    return maxDate(mainHeadCiSuccessAt, otherActivityDates);
}

export function selectPullRequestActivityAt(
    pullRequestCreatedAt: Date,
    timelineEvents: readonly PullRequestTimelineEvent[]
): Date {
    const branchActivityDates: Date[] = [];
    for (const event of timelineEvents) {
        if (isBranchActivityEvent(event.event)) {
            branchActivityDates.push(event.createdAt);
        }
    }

    return maxDate(pullRequestCreatedAt, branchActivityDates);
}

export function evaluateGitHubReleaseGate(input: GitHubReleaseGateInput): GitHubReleaseGateDecision {
    if (input.successfulMainCiRun === undefined) {
        return createMissingCiDecision(input);
    }

    const mainHeadCiSuccessAt = input.successfulMainCiRun.updatedAt;
    const lastRelevantActivityAt = lastRelevantActivityAtFor(input, mainHeadCiSuccessAt);
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
        return createDecision(
            false,
            'activity_not_stale',
            logs,
            'Skipping publish: repository activity is not stale enough yet.'
        );
    }

    return createDecision(
        true,
        quietPeriodElapsed ? 'quiet_period_elapsed' : 'max_latency_elapsed',
        logs,
        'Publishing is allowed by the release gate.'
    );
}
