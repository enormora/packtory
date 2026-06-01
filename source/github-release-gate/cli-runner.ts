import type { FileManager } from '../file-manager/file-manager.ts';
import type { ReleaseAnalysisOutcome } from '../packages/packtory/packtory.entry-point.ts';
import { createGitHubReleaseGateApi } from './github-api.ts';
import { applyPacktoryReleasePolicy } from './release-policy.ts';
import { type GitHubReleaseGateDecision, evaluateGitHubReleaseGate } from './release-gate.ts';
import { createGitHubRepositoryContext, readGitHubReleaseGateRunnerConfig } from './runner-config.ts';

type StdoutWriter = (message: string) => void;

export type GitHubReleaseGateRunnerDependencies = {
    readonly analyzeReleaseAgainstLatestPublished: (config: unknown) => Promise<ReleaseAnalysisOutcome>;
    readonly fetch: typeof globalThis.fetch;
    readonly fileManager: Pick<FileManager, 'writeFile'>;
    readonly getEnvironmentVariable: (variableName: string) => string | undefined;
    readonly loadPacktoryConfig: () => Promise<unknown>;
    readonly now: () => Date;
    readonly stdoutWrite: StdoutWriter;
};

function formatReleaseAnalysisFailure(
    error: Exclude<ReleaseAnalysisOutcome['result'], { readonly isOk: true }>['error']
): string {
    if (error.type === 'partial') {
        return error.failures
            .map((failure: Error) => {
                return failure.message;
            })
            .join('\n');
    }

    return error.issues.join('\n');
}

function writeLogs(write: StdoutWriter, logs: readonly string[]): void {
    for (const line of logs) {
        write(line);
    }
}

function buildGitHubOutput(mainHeadSha: string, decision: GitHubReleaseGateDecision): string {
    return [
        `main_head_sha=${mainHeadSha}`,
        `should_publish=${decision.shouldPublish}`,
        `reason=${decision.reason}`
    ].join('\n');
}

async function writeDecision(
    output: {
        readonly fileManager: Pick<FileManager, 'writeFile'>;
        readonly githubOutputPath: string;
        readonly stdoutWrite: StdoutWriter;
    },
    mainHeadSha: string,
    decision: GitHubReleaseGateDecision
): Promise<void> {
    writeLogs(output.stdoutWrite, decision.logs);
    await output.fileManager.writeFile(output.githubOutputPath, `${buildGitHubOutput(mainHeadSha, decision)}\n`);
}

async function evaluatePacktoryPolicy(
    dependencies: Pick<
        GitHubReleaseGateRunnerDependencies,
        'analyzeReleaseAgainstLatestPublished' | 'loadPacktoryConfig'
    >,
    config: Readonly<ReturnType<typeof readGitHubReleaseGateRunnerConfig>>,
    now: Date,
    timeGateDecision: GitHubReleaseGateDecision & { readonly shouldPublish: true }
): Promise<GitHubReleaseGateDecision> {
    const packtoryConfig = await dependencies.loadPacktoryConfig();
    const releaseAnalysis = await dependencies.analyzeReleaseAgainstLatestPublished(packtoryConfig);
    if (releaseAnalysis.result.isErr) {
        throw new Error(formatReleaseAnalysisFailure(releaseAnalysis.result.error));
    }

    return applyPacktoryReleasePolicy({
        baseDecision: timeGateDecision,
        dependencyOnlyMinAgeDays: config.dependencyOnlyMinAgeDays,
        now,
        releaseAnalysis: releaseAnalysis.result.value
    });
}

async function loadGitHubTimeGateDecision(
    dependencies: Pick<GitHubReleaseGateRunnerDependencies, 'fetch' | 'now'>,
    config: Readonly<ReturnType<typeof readGitHubReleaseGateRunnerConfig>>
): Promise<{ readonly decision: GitHubReleaseGateDecision; readonly mainHeadSha: string; readonly now: Date }> {
    const githubApi = createGitHubReleaseGateApi(dependencies.fetch, createGitHubRepositoryContext(config));
    const mainHeadSha = await githubApi.getMainBranchHeadSha();
    const mainCiRunStatus = await githubApi.getMainCiRunStatus(config.ciWorkflowFile, mainHeadSha);
    const pullRequestActivities = await githubApi.getOpenPullRequestActivities();
    const now = dependencies.now();

    return {
        mainHeadSha,
        now,
        decision: evaluateGitHubReleaseGate({
            ciWorkflowFile: config.ciWorkflowFile,
            mainBranch: config.defaultBranch,
            mainCiRunStatus,
            mainHeadSha,
            maxLatencyHours: config.maxLatencyHours,
            now,
            pullRequestActivities,
            quietPeriodMinutes: config.quietPeriodMinutes
        })
    };
}

export async function runGitHubReleaseGate(dependencies: GitHubReleaseGateRunnerDependencies): Promise<void> {
    const config = readGitHubReleaseGateRunnerConfig(dependencies.getEnvironmentVariable);
    const { decision: timeGateDecision, mainHeadSha, now } = await loadGitHubTimeGateDecision(dependencies, config);

    if (!timeGateDecision.shouldPublish) {
        await writeDecision(
            {
                fileManager: dependencies.fileManager,
                githubOutputPath: config.githubOutputPath,
                stdoutWrite: dependencies.stdoutWrite
            },
            mainHeadSha,
            timeGateDecision
        );
        return;
    }

    const decision = await evaluatePacktoryPolicy(dependencies, config, now, {
        ...timeGateDecision,
        shouldPublish: true
    });

    await writeDecision(
        {
            fileManager: dependencies.fileManager,
            githubOutputPath: config.githubOutputPath,
            stdoutWrite: dependencies.stdoutWrite
        },
        mainHeadSha,
        decision
    );
}
