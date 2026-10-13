import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake, type SinonSpy } from 'sinon';
import { defaultPrLogConfig as defaultPullRequestLogConfiguration, type PullRequestChangedFile } from '@pr-log/core';
import type { PullRequest, PullRequestWithLabel, PullRequestLogEngine } from '../changelog/pull-request-log.ts';
import type { FilterPullRequestsByTargetFilesInput } from '../test-libraries/changelog-handler-fixtures.ts';
import { pullRequestChangedFileFactory } from '../test-libraries/pull-request-log-fixtures.ts';
import { generateChangelogOutputs } from './packtory-changelog.ts';
import type { ReleasePlanPackage } from './packtory-results.ts';

type ChangelogEngine = {
    readonly engine: PullRequestLogEngine;
    readonly filterPullRequestsByTargetFiles: SinonSpy<
        readonly [FilterPullRequestsByTargetFilesInput],
        readonly PullRequest[]
    >;
};

type PullRequestLabelsInput = {
    readonly pullRequests: readonly PullRequest[];
};

function releasePackage(): ReleasePlanPackage {
    return {
        name: 'package-a',
        previousVersion: '1.0.0',
        nextVersion: '1.0.1',
        artifactState: 'changed',
        releaseClassification: 'substantive',
        changed: true,
        previousGitHead: undefined,
        currentGitHead: 'current-head',
        latestRegistryMetadata: undefined,
        artifactFiles: [],
        changedArtifactFiles: [],
        sourceFiles: [],
        changelogSourceFiles: [],
        changelogDependencyNames: [],
        changelogDependencyUpdates: []
    };
}

function createEngine(
    changedFilesByPullRequest: ReadonlyMap<number, readonly PullRequestChangedFile[]>
): ChangelogEngine {
    const pullRequests: readonly PullRequest[] = [ { identifier: 1, title: 'Remove feature' } ];
    const filterPullRequestsByTargetFiles = fake(function (input: FilterPullRequestsByTargetFilesInput) {
        return input.pullRequests;
    });
    const engine = {
        collectMergedPullRequests: fake.resolves(pullRequests),
        filterPullRequestsByTargetFiles,
        readPullRequestChangedFiles: fake.resolves(changedFilesByPullRequest),
        renderGroupedTargetChangelog: fake.returns(''),
        renderTargetChangelog: fake.returns(''),
        resolveChangelogBaseReference: fake.resolves({ reference: 'package-a-base' }),
        resolveLatestSemverChangelogBaseReference: fake.resolves({ reference: 'latest-semver' }),
        resolvePullRequestLabels: fake(
            async function (input: PullRequestLabelsInput): Promise<readonly PullRequestWithLabel[]> {
                return input.pullRequests.map(function (pullRequest) {
                    return { ...pullRequest, label: 'bug' };
                });
            }
        )
    };

    return {
        engine: engine as unknown as PullRequestLogEngine,
        filterPullRequestsByTargetFiles
    };
}

async function generateWithSourceRoots(
    engine: PullRequestLogEngine,
    changelogSourceFileRootsByPackageName: ReadonlyMap<string, readonly string[]>
): Promise<void> {
    await generateChangelogOutputs({
        packages: [ releasePackage() ],
        pullRequestLogEngine: engine,
        changelogSourceFileRootsByPackageName,
        explicitBaseReference: undefined,
        githubRepository: 'owner/repo',
        packageTagFormat: undefined,
        currentDate: new Date('2026-06-13T00:00:00.000Z'),
        ignoredAttributionPaths: [],
        pullRequestLogConfiguration: defaultPullRequestLogConfiguration,
        targetScopedLabelPattern: undefined
    });
}

suite('packtory changelog source file history', function () {
    test('adds deleted source files from configured package source roots', async function () {
        const { engine, filterPullRequestsByTargetFiles } = createEngine(
            new Map([
                [ 1, [ pullRequestChangedFileFactory.build({ path: 'source/removed.ts', status: 'removed' }) ] ]
            ])
        );

        await generateWithSourceRoots(engine, new Map([ [ 'package-a', [ 'source' ] ] ]));

        assert.deepStrictEqual(filterPullRequestsByTargetFiles.firstCall.args[0].targetSourceFiles, [
            'source/removed.ts'
        ]);
    });
});
