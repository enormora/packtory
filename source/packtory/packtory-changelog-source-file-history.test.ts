import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake, type SinonSpy } from 'sinon';
import {
    defaultPrLogConfig,
    type FilterPullRequestsByTargetFilesInput,
    type PrLogEngine,
    type PullRequest,
    type PullRequestChangedFile,
    type PullRequestWithLabel
} from '@pr-log/core';
import { pullRequestChangedFileFactory } from '../test-libraries/pr-log-fixtures.ts';
import { generateChangelogOutputs } from './packtory-changelog.ts';
import type { ReleasePlanPackage } from './packtory-results.ts';

type ChangelogEngine = {
    readonly engine: PrLogEngine;
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
        name: 'pkg-a',
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
    const pullRequests: readonly PullRequest[] = [ { id: 1, title: 'Remove feature' } ];
    const filterPullRequestsByTargetFiles = fake(function (input: FilterPullRequestsByTargetFilesInput) {
        return input.pullRequests;
    });
    const engine = {
        collectMergedPullRequests: fake.resolves(pullRequests),
        filterPullRequestsByTargetFiles,
        readPullRequestChangedFiles: fake.resolves(changedFilesByPullRequest),
        renderGroupedTargetChangelog: fake.returns(''),
        renderTargetChangelog: fake.returns(''),
        resolveChangelogBaseRef: fake.resolves({ ref: 'pkg-a-base' }),
        resolveLatestSemverChangelogBaseRef: fake.resolves({ ref: 'latest-semver' }),
        resolvePullRequestLabels: fake(
            async function (input: PullRequestLabelsInput): Promise<readonly PullRequestWithLabel[]> {
                return input.pullRequests.map(function (pullRequest) {
                    return { ...pullRequest, label: 'bug' };
                });
            }
        )
    };

    return {
        engine: engine as unknown as PrLogEngine,
        filterPullRequestsByTargetFiles
    };
}

async function generateWithSourceRoots(
    engine: PrLogEngine,
    changelogSourceFileRootsByPackageName: ReadonlyMap<string, readonly string[]>
): Promise<void> {
    await generateChangelogOutputs({
        packages: [ releasePackage() ],
        prLogEngine: engine,
        changelogSourceFileRootsByPackageName,
        explicitBaseRef: undefined,
        githubRepo: 'owner/repo',
        packageTagFormat: undefined,
        currentDate: new Date('2026-06-13T00:00:00.000Z'),
        ignoredAttributionPaths: [],
        prLogConfig: defaultPrLogConfig,
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

        await generateWithSourceRoots(engine, new Map([ [ 'pkg-a', [ 'source' ] ] ]));

        assert.deepStrictEqual(filterPullRequestsByTargetFiles.firstCall.args[0].targetSourceFiles, [
            'source/removed.ts'
        ]);
    });
});
