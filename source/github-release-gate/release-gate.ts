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

type SuccessfulMainCiRun = {
    readonly htmlUrl: string;
    readonly updatedAt: Date;
};

type MainCiRunInProgressStatus = { readonly kind: 'in_progress'; };
type MainCiRunMissingStatus = { readonly kind: 'missing'; };
type MainCiRunSuccessStatus = { readonly kind: 'success'; readonly run: SuccessfulMainCiRun; };

export type MainCiRunStatus = MainCiRunInProgressStatus | MainCiRunMissingStatus | MainCiRunSuccessStatus;

type CiDecisionReason = 'activity_not_stale' | 'ci_in_progress' | 'ci_not_green';
type DependencyPolicyDecisionReason = keyof {
    readonly dependency_only_min_age_elapsed: true;
    readonly dependency_only_min_age_not_elapsed: true;
    readonly dependency_only_published_at_unknown: true;
};
type PublishWindowDecisionReason = 'max_latency_elapsed' | 'quiet_period_elapsed' | 'release_unchanged';
type GitHubReleaseGateDecisionReason = CiDecisionReason | DependencyPolicyDecisionReason | PublishWindowDecisionReason;

export type GitHubReleaseGateDecision = {
    readonly logs: readonly string[];
    readonly reason: GitHubReleaseGateDecisionReason;
    readonly shouldPublish: boolean;
};

export type GitHubReleaseGateInput = {
    readonly ciWorkflowFile: string;
    readonly mainBranch: string;
    readonly mainCiRunStatus: MainCiRunStatus;
    readonly mainHeadSha: string;
    readonly maxLatencyHours: number;
    readonly now: Date;
    readonly pullRequestActivities: readonly PullRequestActivity[];
    readonly quietPeriodMinutes: number;
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

type ElapsedFlags = {
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
        logs: [ ...logs, decisionLog ]
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

function createInProgressCiDecision(input: GitHubReleaseGateInput): GitHubReleaseGateDecision {
    const inProgressLog =
        `Skipping publish: a ${input.ciWorkflowFile} push run is still in progress for ${input.mainBranch} ` +
        `HEAD ${input.mainHeadSha}.`;

    return createDecision(false, 'ci_in_progress', [], inProgressLog);
}

function hasElapsed(now: Date, since: Date, elapsedMilliseconds: number): boolean {
    return now.getTime() - since.getTime() >= elapsedMilliseconds;
}

function getElapsedFlags(
    input: GitHubReleaseGateInput,
    mainHeadCiSuccessAt: Date,
    lastRelevantActivityAt: Date
): ElapsedFlags {
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
    return [ 'committed', 'head_ref_deleted', 'head_ref_force_pushed', 'head_ref_restored' ].includes(
        activityEventName
    );
}

function lastRelevantActivityAtFor(input: GitHubReleaseGateInput, mainHeadCiSuccessAt: Date): Date {
    const otherActivityDates: Date[] = Array.from(
        input.pullRequestActivities,
        function (pullRequestActivity) {
            return pullRequestActivity.activityAt;
        }
    );

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

function evaluateGreenCiGate(
    input: GitHubReleaseGateInput,
    successfulMainCiRun: SuccessfulMainCiRun
): GitHubReleaseGateDecision {
    const mainHeadCiSuccessAt = successfulMainCiRun.updatedAt;
    const lastRelevantActivityAt = lastRelevantActivityAtFor(input, mainHeadCiSuccessAt);
    const { quietPeriodElapsed, maxLatencyElapsed } = getElapsedFlags(
        input,
        mainHeadCiSuccessAt,
        lastRelevantActivityAt
    );
    const logs = buildDecisionLogs({
        input,
        mainHeadCiSuccessAt,
        mainHeadCiSuccessHtmlUrl: successfulMainCiRun.htmlUrl,
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

export function evaluateGitHubReleaseGate(input: GitHubReleaseGateInput): GitHubReleaseGateDecision {
    if (input.mainCiRunStatus.kind === 'in_progress') {
        return createInProgressCiDecision(input);
    }

    if (input.mainCiRunStatus.kind === 'missing') {
        return createMissingCiDecision(input);
    }

    return evaluateGreenCiGate(input, input.mainCiRunStatus.run);
}
