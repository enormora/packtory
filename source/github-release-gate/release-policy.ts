import type { ReleaseAnalysis } from '../packages/packtory/packtory.entry-point.ts';
import { releaseAnalysisClassification } from '../packtory/packtory-results.ts';
import type { GitHubReleaseGateDecision } from './release-gate.ts';

type OpenGitHubReleaseGateDecision = GitHubReleaseGateDecision & { readonly shouldPublish: true; };

type PacktoryReleasePolicyInput = {
    readonly baseDecision: OpenGitHubReleaseGateDecision;
    readonly dependencyOnlyMinAgeDays: number;
    readonly now: Date;
    readonly releaseAnalysis: ReleaseAnalysis;
};

type DependencyAgePolicyDecisionReason = keyof {
    readonly dependency_only_min_age_elapsed: true;
    readonly dependency_only_min_age_not_elapsed: true;
    readonly dependency_only_published_at_unknown: true;
};
type PolicyDecisionReason = DependencyAgePolicyDecisionReason | 'release_unchanged';

const millisecondsPerDay = 86_400_000;

function formatPublishedAt(date: Date | undefined): string {
    return date === undefined ? '(unknown)' : date.toISOString();
}

function buildReleaseAnalysisLogs(releaseAnalysis: ReleaseAnalysis): readonly string[] {
    const logs = [
        `release classification: ${releaseAnalysis.classification}`,
        `most recent published package timestamp: ${formatPublishedAt(releaseAnalysis.mostRecentPublishedAt)}`
    ];

    for (const analysis of releaseAnalysis.packageAnalyses) {
        const packageLog = `package ${analysis.name}: ${analysis.classification}` +
            ` latest=${analysis.latestPublishedVersion ?? '(unpublished)'}` +
            ` publishedAt=${formatPublishedAt(analysis.latestPublishedAt)}`;
        logs.push(packageLog);
    }

    return logs;
}

function minAgeElapsed(now: Date, publishedAt: Date, dependencyOnlyMinAgeDays: number): boolean {
    return now.getTime() - publishedAt.getTime() >= dependencyOnlyMinAgeDays * millisecondsPerDay;
}

function formatMinimumAgePendingLog(dependencyOnlyMinAgeDays: number): string {
    const intro = 'Skipping publish: dependency-only releases must age for at least';
    return `${intro} ${dependencyOnlyMinAgeDays} day(s).`;
}

function formatMinimumAgeElapsedLog(dependencyOnlyMinAgeDays: number): string {
    const intro = 'Publishing is allowed because the dependency-only minimum age of';
    return `${intro} ${dependencyOnlyMinAgeDays} day(s) has elapsed.`;
}

function createPolicyDecision(
    shouldPublish: boolean,
    reason: PolicyDecisionReason,
    logs: readonly string[],
    policyLog: string
): GitHubReleaseGateDecision {
    return {
        shouldPublish,
        reason,
        logs: [ ...logs, policyLog ]
    };
}

export function applyPacktoryReleasePolicy(input: PacktoryReleasePolicyInput): GitHubReleaseGateDecision {
    const logs = [ ...input.baseDecision.logs, ...buildReleaseAnalysisLogs(input.releaseAnalysis) ];

    if (input.releaseAnalysis.classification === releaseAnalysisClassification.unchanged) {
        return createPolicyDecision(
            false,
            'release_unchanged',
            logs,
            'Skipping publish: the next Packtory release would be unchanged versus npm latest.'
        );
    }

    if (input.releaseAnalysis.classification !== releaseAnalysisClassification.dependencyOnly) {
        return {
            ...input.baseDecision,
            logs: [ ...logs, 'Publishing is allowed by the Packtory release policy.' ]
        };
    }

    if (input.releaseAnalysis.mostRecentPublishedAt === undefined) {
        return createPolicyDecision(
            true,
            'dependency_only_published_at_unknown',
            logs,
            'Publishing is allowed because this dependency-only release has no publishedAt baseline to delay from.'
        );
    }

    if (!minAgeElapsed(input.now, input.releaseAnalysis.mostRecentPublishedAt, input.dependencyOnlyMinAgeDays)) {
        return createPolicyDecision(
            false,
            'dependency_only_min_age_not_elapsed',
            logs,
            formatMinimumAgePendingLog(input.dependencyOnlyMinAgeDays)
        );
    }

    return createPolicyDecision(
        true,
        'dependency_only_min_age_elapsed',
        logs,
        formatMinimumAgeElapsedLog(input.dependencyOnlyMinAgeDays)
    );
}
