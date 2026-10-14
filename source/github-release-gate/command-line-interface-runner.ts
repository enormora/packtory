import type { FileManager } from '../file-manager/file-manager.ts';
import type { ReleaseAnalysisOutcome } from '../packages/packtory/packtory.entry-point.ts';
import { createGitHubReleaseGateApplicationProgrammingInterface } from './github-application-programming-interface.ts';
import { applyPacktoryReleasePolicy } from './release-policy.ts';
import { type GitHubReleaseGateDecision, evaluateGitHubReleaseGate } from './release-gate.ts';
import {
    createGitHubRepositoryContext,
    readGitHubReleaseGateRunnerConfiguration,
    type GitHubReleaseGateRunnerConfiguration
} from './runner-configuration.ts';

type StandardOutputWriter = (message: string) => void;
type DecisionOutput = {
    readonly fileManager: Pick<FileManager, 'writeFile'>;
    readonly githubOutputPath: string;
    readonly standardOutputWrite: StandardOutputWriter;
};

export type GitHubReleaseGateRunnerDependencies = {
    readonly analyzeReleaseAgainstLatestPublished: (configuration: unknown) => Promise<ReleaseAnalysisOutcome>;
    readonly fetch: typeof globalThis.fetch;
    readonly fileManager: Pick<FileManager, 'writeFile'>;
    readonly getEnvironmentVariable: (variableName: string) => string | undefined;
    readonly loadPacktoryConfiguration: () => Promise<unknown>;
    readonly now: () => Date;
    readonly standardOutputWrite: StandardOutputWriter;
};

function formatReleaseAnalysisFailure(
    error: Readonly<Exclude<ReleaseAnalysisOutcome['result'], { readonly isOk: true; }>['error']>
): string {
    if (error.type === 'partial') {
        return error
            .failures
            .map(function (failure: Pick<Error, 'message'>) {
                return failure.message;
            })
            .join('\n');
    }

    return error.issues.join('\n');
}

function writeLogs(write: StandardOutputWriter, logs: readonly string[]): void {
    for (const line of logs) {
        write(line);
    }
}

function buildGitHubOutput(mainHeadHash: string, decision: GitHubReleaseGateDecision): string {
    return [
        `main_head_sha=${mainHeadHash}`,
        `should_publish=${decision.shouldPublish}`,
        `reason=${decision.reason}`
    ]
        .join('\n');
}

async function writeDecision(
    output: DecisionOutput,
    mainHeadHash: string,
    decision: GitHubReleaseGateDecision
): Promise<void> {
    writeLogs(output.standardOutputWrite, decision.logs);
    await output.fileManager.writeFile(output.githubOutputPath, `${buildGitHubOutput(mainHeadHash, decision)}\n`);
}

async function evaluatePacktoryPolicy(
    dependencies: Pick<
        GitHubReleaseGateRunnerDependencies,
        'analyzeReleaseAgainstLatestPublished' | 'loadPacktoryConfiguration'
    >,
    configuration: Readonly<GitHubReleaseGateRunnerConfiguration>,
    now: Date,
    timeGateDecision: GitHubReleaseGateDecision & { readonly shouldPublish: true; }
): Promise<GitHubReleaseGateDecision> {
    const packtoryConfiguration = await dependencies.loadPacktoryConfiguration();
    const releaseAnalysis = await dependencies.analyzeReleaseAgainstLatestPublished(packtoryConfiguration);
    if (releaseAnalysis.result.isErr) {
        throw new Error(formatReleaseAnalysisFailure(releaseAnalysis.result.error));
    }

    return applyPacktoryReleasePolicy({
        baseDecision: timeGateDecision,
        dependencyOnlyMinimumAgeDays: configuration.dependencyOnlyMinimumAgeDays,
        now,
        releaseAnalysis: releaseAnalysis.result.value
    });
}

async function loadGitHubTimeGateDecision(
    dependencies: Pick<GitHubReleaseGateRunnerDependencies, 'fetch' | 'now'>,
    configuration: Readonly<GitHubReleaseGateRunnerConfiguration>
): Promise<{ readonly decision: GitHubReleaseGateDecision; readonly mainHeadHash: string; readonly now: Date; }> {
    const githubApplicationProgrammingInterface = createGitHubReleaseGateApplicationProgrammingInterface(
        dependencies.fetch,
        createGitHubRepositoryContext(configuration)
    );
    const mainHeadHash = await githubApplicationProgrammingInterface.getMainBranchHeadHash();
    const mainContinuousIntegrationRunStatus = await githubApplicationProgrammingInterface
        .getMainContinuousIntegrationRunStatus(configuration.continuousIntegrationWorkflowFile, mainHeadHash);
    const pullRequestActivities = await githubApplicationProgrammingInterface.getOpenPullRequestActivities();
    const now = dependencies.now();

    return {
        mainHeadHash,
        now,
        decision: evaluateGitHubReleaseGate({
            continuousIntegrationWorkflowFile: configuration.continuousIntegrationWorkflowFile,
            mainBranch: configuration.defaultBranch,
            mainContinuousIntegrationRunStatus,
            mainHeadHash,
            maximumLatencyHours: configuration.maximumLatencyHours,
            now,
            pullRequestActivities,
            quietPeriodMinutes: configuration.quietPeriodMinutes
        })
    };
}

export async function runGitHubReleaseGate(dependencies: GitHubReleaseGateRunnerDependencies): Promise<void> {
    const configuration = readGitHubReleaseGateRunnerConfiguration(dependencies.getEnvironmentVariable);
    const { decision: timeGateDecision, mainHeadHash, now } = await loadGitHubTimeGateDecision(
        dependencies,
        configuration
    );
    const checkedOutHeadHash = dependencies.getEnvironmentVariable('CHECKED_OUT_HEAD_HASH');
    if (checkedOutHeadHash !== undefined && checkedOutHeadHash !== mainHeadHash) {
        throw new Error(
            `Checked-out commit ${checkedOutHeadHash} differs from main HEAD ${mainHeadHash}; retry from main`
        );
    }

    if (!timeGateDecision.shouldPublish) {
        await writeDecision(
            {
                fileManager: dependencies.fileManager,
                githubOutputPath: configuration.githubOutputPath,
                standardOutputWrite: dependencies.standardOutputWrite
            },
            mainHeadHash,
            timeGateDecision
        );
        return;
    }

    const decision = await evaluatePacktoryPolicy(dependencies, configuration, now, {
        ...timeGateDecision,
        shouldPublish: true
    });

    await writeDecision(
        {
            fileManager: dependencies.fileManager,
            githubOutputPath: configuration.githubOutputPath,
            standardOutputWrite: dependencies.standardOutputWrite
        },
        mainHeadHash,
        decision
    );
}
