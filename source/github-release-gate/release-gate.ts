import { maximumDate } from '../common/maximum-date.ts';

export type PullRequestTimelineEvent = {
    readonly createdAt: Date;
    readonly event?: string | undefined;
};

export type PullRequestActivity = {
    readonly activityAt: Date;
    readonly hypertextMarkupLanguageAddress: string;
    readonly number: number;
};

type SuccessfulMainContinuousIntegrationRun = {
    readonly hypertextMarkupLanguageAddress: string;
    readonly updatedAt: Date;
};

type MainContinuousIntegrationRunInProgressStatus = { readonly kind: 'in_progress'; };
type MainContinuousIntegrationRunMissingStatus = { readonly kind: 'missing'; };
type MainContinuousIntegrationRunSuccessStatus = {
    readonly kind: 'success';
    readonly run: SuccessfulMainContinuousIntegrationRun;
};

type MainWorkflowStatuses = {
    readonly running: MainContinuousIntegrationRunInProgressStatus;
    readonly missing: MainContinuousIntegrationRunMissingStatus;
    readonly succeeded: MainContinuousIntegrationRunSuccessStatus;
};
export type MainContinuousIntegrationRunStatus = MainWorkflowStatuses[keyof MainWorkflowStatuses];

type ContinuousIntegrationDecisionReason = 'activity_not_stale' | 'ci_in_progress' | 'ci_not_green';
type DependencyPolicyDecisionReason = keyof {
    readonly dependency_only_minimum_age_elapsed: true;
    readonly dependency_only_minimum_age_not_elapsed: true;
    readonly dependency_only_published_at_unknown: true;
};
type PublishWindowDecisionReason = 'max_latency_elapsed' | 'quiet_period_elapsed' | 'release_unchanged';
type GateDecisionReasons = {
    readonly continuousIntegration: ContinuousIntegrationDecisionReason;
    readonly dependencyPolicy: DependencyPolicyDecisionReason;
    readonly publishWindow: PublishWindowDecisionReason;
};
type GitHubReleaseGateDecisionReason = GateDecisionReasons[keyof GateDecisionReasons];

export type GitHubReleaseGateDecision = {
    readonly logs: readonly string[];
    readonly reason: GitHubReleaseGateDecisionReason;
    readonly shouldPublish: boolean;
};

export type GitHubReleaseGateInput = {
    readonly continuousIntegrationWorkflowFile: string;
    readonly mainBranch: string;
    readonly mainContinuousIntegrationRunStatus: MainContinuousIntegrationRunStatus;
    readonly mainHeadHash: string;
    readonly maximumLatencyHours: number;
    readonly now: Date;
    readonly pullRequestActivities: readonly PullRequestActivity[];
    readonly quietPeriodMinutes: number;
};

const millisecondsPerMinute = 60_000;
const millisecondsPerHour = 3_600_000;

type DecisionLogContext = {
    readonly input: GitHubReleaseGateInput;
    readonly lastRelevantActivityAt: Date;
    readonly mainHeadContinuousIntegrationSuccessAt: Date;
    readonly mainHeadContinuousIntegrationSuccessHypertextMarkupLanguageAddress: string;
    readonly maximumLatencyElapsed: boolean;
    readonly quietPeriodElapsed: boolean;
};

type ElapsedFlags = {
    readonly maximumLatencyElapsed: boolean;
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

function createMainContinuousIntegrationSuccessLog(context: DecisionLogContext): string {
    const address = context.mainHeadContinuousIntegrationSuccessHypertextMarkupLanguageAddress;
    return `main CI success: ${context.mainHeadContinuousIntegrationSuccessAt.toISOString()} (${address})`;
}

function buildDecisionLogs(context: DecisionLogContext): readonly string[] {
    const logs = [
        `main HEAD: ${context.input.mainHeadHash}`,
        createMainContinuousIntegrationSuccessLog(context),
        `open PRs targeting ${context.input.mainBranch}: ${context.input.pullRequestActivities.length}`
    ];

    for (const pullRequestActivity of context.input.pullRequestActivities) {
        const activityAt = pullRequestActivity.activityAt.toISOString();
        const address = pullRequestActivity.hypertextMarkupLanguageAddress;
        logs.push(
            `PR #${pullRequestActivity.number} activity: ${activityAt} ${address}`
        );
    }

    logs.push(
        `last relevant activity: ${context.lastRelevantActivityAt.toISOString()}`,
        `quiet period elapsed: ${context.quietPeriodElapsed}`,
        `max latency elapsed: ${context.maximumLatencyElapsed}`
    );

    return logs;
}

function createMissingContinuousIntegrationDecision(input: GitHubReleaseGateInput): GitHubReleaseGateDecision {
    const missingContinuousIntegrationLog =
        `Skipping publish: no successful ${input.continuousIntegrationWorkflowFile} push run ` +
        `found for ${input.mainBranch} ` +
        `HEAD ${input.mainHeadHash}.`;

    return createDecision(false, 'ci_not_green', [], missingContinuousIntegrationLog);
}

function createInProgressContinuousIntegrationDecision(input: GitHubReleaseGateInput): GitHubReleaseGateDecision {
    const inProgressLog =
        `Skipping publish: a ${input.continuousIntegrationWorkflowFile} push run is still in progress ` +
        `for ${input.mainBranch} ` +
        `HEAD ${input.mainHeadHash}.`;

    return createDecision(false, 'ci_in_progress', [], inProgressLog);
}

function hasElapsed(now: Date, since: Date, elapsedMilliseconds: number): boolean {
    return now.getTime() - since.getTime() >= elapsedMilliseconds;
}

function getElapsedFlags(
    input: GitHubReleaseGateInput,
    mainHeadContinuousIntegrationSuccessAt: Date,
    lastRelevantActivityAt: Date
): ElapsedFlags {
    return {
        quietPeriodElapsed: hasElapsed(
            input.now,
            lastRelevantActivityAt,
            input.quietPeriodMinutes * millisecondsPerMinute
        ),
        maximumLatencyElapsed: hasElapsed(
            input.now,
            mainHeadContinuousIntegrationSuccessAt,
            input.maximumLatencyHours * millisecondsPerHour
        )
    };
}

function isBranchActivityEvent(eventName: string | undefined): boolean {
    const activityEventName = String(eventName);
    return [ 'committed', 'head_ref_deleted', 'head_ref_force_pushed', 'head_ref_restored' ].includes(
        activityEventName
    );
}

function lastRelevantActivityAtFor(input: GitHubReleaseGateInput, mainHeadContinuousIntegrationSuccessAt: Date): Date {
    const otherActivityDates: Date[] = Array.from(
        input.pullRequestActivities,
        function (pullRequestActivity) {
            return pullRequestActivity.activityAt;
        }
    );

    return maximumDate(mainHeadContinuousIntegrationSuccessAt, otherActivityDates);
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

    return maximumDate(pullRequestCreatedAt, branchActivityDates);
}

function evaluateGreenContinuousIntegrationGate(
    input: GitHubReleaseGateInput,
    successfulMainContinuousIntegrationRun: SuccessfulMainContinuousIntegrationRun
): GitHubReleaseGateDecision {
    const mainHeadContinuousIntegrationSuccessAt = successfulMainContinuousIntegrationRun.updatedAt;
    const lastRelevantActivityAt = lastRelevantActivityAtFor(input, mainHeadContinuousIntegrationSuccessAt);
    const { quietPeriodElapsed, maximumLatencyElapsed } = getElapsedFlags(
        input,
        mainHeadContinuousIntegrationSuccessAt,
        lastRelevantActivityAt
    );
    const logs = buildDecisionLogs({
        input,
        mainHeadContinuousIntegrationSuccessAt,
        mainHeadContinuousIntegrationSuccessHypertextMarkupLanguageAddress: successfulMainContinuousIntegrationRun
            .hypertextMarkupLanguageAddress,
        lastRelevantActivityAt,
        quietPeriodElapsed,
        maximumLatencyElapsed
    });

    if (!quietPeriodElapsed && !maximumLatencyElapsed) {
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
    if (input.mainContinuousIntegrationRunStatus.kind === 'in_progress') {
        return createInProgressContinuousIntegrationDecision(input);
    }

    if (input.mainContinuousIntegrationRunStatus.kind === 'missing') {
        return createMissingContinuousIntegrationDecision(input);
    }

    return evaluateGreenContinuousIntegrationGate(input, input.mainContinuousIntegrationRunStatus.run);
}
