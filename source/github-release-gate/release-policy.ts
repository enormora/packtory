import type { ReleaseAnalysis } from '../packages/packtory/packtory.entry-point.ts';
import type { GitHubReleaseGateDecision } from './release-gate.ts';

type OpenGitHubReleaseGateDecision = GitHubReleaseGateDecision & { readonly shouldPublish: true };

type PacktoryReleasePolicyInput = {
    readonly baseDecision: OpenGitHubReleaseGateDecision;
    readonly dependencyOnlyMinAgeDays: number;
    readonly now: Date;
    readonly releaseAnalysis: ReleaseAnalysis;
};

const hoursPerDay = 24;
const minutesPerHour = 60;
const secondsPerMinute = 60;
const millisecondsPerSecond = 1000;
const millisecondsPerDay = hoursPerDay * minutesPerHour * secondsPerMinute * millisecondsPerSecond;

function formatPublishedAt(date: Date | undefined): string {
    return date === undefined ? '(unknown)' : date.toISOString();
}

function buildReleaseAnalysisLogs(releaseAnalysis: ReleaseAnalysis): readonly string[] {
    return [
        `release classification: ${releaseAnalysis.classification}`,
        `most recent published package timestamp: ${formatPublishedAt(releaseAnalysis.mostRecentPublishedAt)}`,
        ...releaseAnalysis.packageAnalyses.map((analysis) => {
            return (
                `package ${analysis.name}: ${analysis.classification}` +
                ` latest=${analysis.latestPublishedVersion ?? '(unpublished)'}` +
                ` publishedAt=${formatPublishedAt(analysis.latestPublishedAt)}`
            );
        })
    ];
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

export function applyPacktoryReleasePolicy(input: PacktoryReleasePolicyInput): GitHubReleaseGateDecision {
    const logs = [...input.baseDecision.logs, ...buildReleaseAnalysisLogs(input.releaseAnalysis)];

    if (input.releaseAnalysis.classification === 'unchanged') {
        return {
            shouldPublish: false,
            reason: 'release_unchanged',
            logs: [...logs, 'Skipping publish: the next Packtory release would be unchanged versus npm latest.']
        };
    }

    if (input.releaseAnalysis.classification !== 'dependency-only') {
        return {
            ...input.baseDecision,
            logs: [...logs, 'Publishing is allowed by the Packtory release policy.']
        };
    }

    if (input.releaseAnalysis.mostRecentPublishedAt === undefined) {
        return {
            shouldPublish: true,
            reason: 'dependency_only_published_at_unknown',
            logs: [
                ...logs,
                'Publishing is allowed because this dependency-only release has no publishedAt baseline to delay from.'
            ]
        };
    }

    if (!minAgeElapsed(input.now, input.releaseAnalysis.mostRecentPublishedAt, input.dependencyOnlyMinAgeDays)) {
        return {
            shouldPublish: false,
            reason: 'dependency_only_min_age_not_elapsed',
            logs: [...logs, formatMinimumAgePendingLog(input.dependencyOnlyMinAgeDays)]
        };
    }

    return {
        shouldPublish: true,
        reason: 'dependency_only_min_age_elapsed',
        logs: [...logs, formatMinimumAgeElapsedLog(input.dependencyOnlyMinAgeDays)]
    };
}
