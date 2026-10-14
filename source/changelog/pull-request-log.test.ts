import assert from 'node:assert';
import {
    defaultPrLogConfig as configuration,
    type PrLogEngine as LibraryEngine,
    type PullRequestWithLabel as LibraryRequest
} from '@pr-log/core';
import { suite, test } from 'mocha';
import { fake, type SinonSpy } from 'sinon';
import { ok } from 'true-myth/result';
import {
    createPullRequestLogEngineFactory,
    type PullRequestLogEngine,
    type PullRequestWithLabel
} from './pull-request-log.ts';

type RecordedLibraryEngine = {
    readonly [Method in keyof LibraryEngine]: SinonSpy;
};
type EngineFixture = {
    readonly engine: PullRequestLogEngine;
    readonly libraryEngine: RecordedLibraryEngine;
    readonly createLibraryEngine: SinonSpy;
    readonly libraryRequest: LibraryRequest;
    readonly request: PullRequestWithLabel;
    readonly changedFiles: Awaited<ReturnType<LibraryEngine['readPullRequestChangedFiles']>>;
    readonly labels: Awaited<ReturnType<LibraryEngine['readPullRequestLabels']>>;
    readonly extractedSection: ReturnType<LibraryEngine['extractChangelogReleaseSection']>;
};

function createEngine(): EngineFixture {
    const libraryRequest = { id: 42, title: 'Release', label: 'feature' };
    const request = { identifier: 42, title: 'Release', label: 'feature' };
    const changedFiles = new Map([ [ 42, [ {
        path: 'source/index.ts',
        previousPath: undefined,
        status: 'modified',
        additions: 1,
        deletions: 0,
        changes: 1
    } ] ] ]);
    const labels = new Map([ [ 42, [ 'feature' ] ] ]);
    const extractedSection = ok<string>('release section');
    const libraryEngine = {
        resolveChangelogBaseRef: fake.resolves({ ref: 'explicit' }),
        resolveLatestSemverChangelogBaseRef: fake.resolves({ ref: 'latest' }),
        collectMergedPullRequests: fake.resolves([ libraryRequest ]),
        readPullRequestChangedFiles: fake.resolves(changedFiles),
        readPullRequestLabels: fake.resolves(labels),
        filterPullRequestsByTargetFiles: fake.returns([ libraryRequest ]),
        resolvePullRequestLabels: fake.resolves([ libraryRequest ]),
        resolveVersionNumber: fake.returns('2.0.0'),
        extractChangelogReleaseSection: fake.returns(extractedSection),
        renderChangelog: fake.returns('changelog'),
        renderTargetChangelog: fake.returns('target changelog'),
        renderGroupedTargetChangelog: fake.returns('grouped changelog'),
        updateChangelog: fake.returns('updated changelog')
    };
    const createLibraryEngine = fake.returns(libraryEngine);
    const engine = createPullRequestLogEngineFactory(createLibraryEngine)({
        workingDirectory: '/project',
        githubToken: 'token',
        configuration
    });
    return {
        libraryRequest,
        request,
        changedFiles,
        labels,
        extractedSection,
        libraryEngine,
        createLibraryEngine,
        engine
    };
}

suite('pull request log adapter', function () {
    suite('requests', function () {
        test('translates factory configuration', async function () {
            const { createLibraryEngine } = createEngine();
            assert.deepStrictEqual(createLibraryEngine.firstCall.args, [ {
                workingDirectory: '/project',
                githubToken: 'token',
                config: configuration,
                githubApiBaseUrl: undefined
            } ]);
        });

        test('translates base references', async function () {
            const { libraryEngine, engine } = createEngine();
            const base = {
                packageName: 'package',
                previousVersion: undefined,
                previousGitHead: undefined,
                packageTagFormat: undefined,
                explicitBaseReference: 'explicit'
            };
            assert.deepStrictEqual(await engine.resolveChangelogBaseReference(base), { reference: 'explicit' });
            assert.deepStrictEqual(libraryEngine.resolveChangelogBaseRef.firstCall.args, [ {
                packageName: 'package',
                previousVersion: undefined,
                previousGitHead: undefined,
                packageTagFormat: undefined,
                explicitBaseRef: 'explicit'
            } ]);
            assert.deepStrictEqual(await engine.resolveLatestSemverChangelogBaseReference(), { reference: 'latest' });
        });

        test('translates collection inputs and request identifiers', async function () {
            const { request, libraryEngine, engine } = createEngine();
            assert.deepStrictEqual(
                await engine.collectMergedPullRequests({
                    githubRepository: 'owner/project',
                    baseReference: 'main'
                }),
                [ request ]
            );
            assert.deepStrictEqual(libraryEngine.collectMergedPullRequests.firstCall.args, [ {
                githubRepo: 'owner/project',
                baseRef: 'main'
            } ]);
        });

        test('translates changed-file lookup requests', async function () {
            const { libraryRequest, request, changedFiles, libraryEngine, engine } = createEngine();
            assert.strictEqual(
                await engine.readPullRequestChangedFiles({
                    githubRepository: 'owner/project',
                    pullRequests: [ request ]
                }),
                changedFiles
            );
            assert.deepStrictEqual(libraryEngine.readPullRequestChangedFiles.firstCall.args, [ {
                githubRepo: 'owner/project',
                pullRequests: [ libraryRequest ]
            } ]);
        });

        test('translates label lookup requests', async function () {
            const { libraryRequest, request, labels, libraryEngine, engine } = createEngine();
            assert.strictEqual(
                await engine.readPullRequestLabels({ githubRepository: 'owner/project', pullRequests: [ request ] }),
                labels
            );
            assert.deepStrictEqual(libraryEngine.readPullRequestLabels.firstCall.args, [ {
                githubRepo: 'owner/project',
                pullRequests: [ libraryRequest ]
            } ]);
        });

        test('translates file filtering inputs without changing requests', async function () {
            const { libraryRequest, request, changedFiles, libraryEngine, engine } = createEngine();
            const targetInput = {
                targetName: 'package',
                targetSourceFiles: [ 'source/index.ts' ],
                pullRequests: [ request ],
                changedFilesByPullRequest: changedFiles,
                ignoredAttributionPaths: []
            };
            assert.deepStrictEqual(engine.filterPullRequestsByTargetFiles(targetInput), [ request ]);
            assert.deepStrictEqual(libraryEngine.filterPullRequestsByTargetFiles.firstCall.args, [ {
                ...targetInput,
                pullRequests: [ libraryRequest ]
            } ]);
            assert.deepStrictEqual(request, { identifier: 42, title: 'Release', label: 'feature' });
        });

        test('translates label resolution inputs and outputs', async function () {
            const { libraryRequest, request, libraryEngine, engine } = createEngine();
            const requestInput = { githubRepository: 'owner/project', pullRequests: [ request ] };
            const labelInput = {
                ...requestInput,
                configuration,
                targetName: undefined,
                targetScopedLabelPattern: undefined
            };
            assert.deepStrictEqual(await engine.resolvePullRequestLabels(labelInput), [ request ]);
            assert.deepStrictEqual(libraryEngine.resolvePullRequestLabels.firstCall.args, [ {
                githubRepo: 'owner/project',
                pullRequests: [ libraryRequest ],
                config: configuration,
                targetName: undefined,
                targetScopedLabelPattern: undefined
            } ]);
        });

        test('translates version resolution inputs', async function () {
            const { libraryRequest, request, libraryEngine, engine } = createEngine();
            assert.strictEqual(
                engine.resolveVersionNumber({
                    latestVersionTag: '1.0.0',
                    mergedPullRequests: [ request ],
                    configuration
                }),
                '2.0.0'
            );
            assert.deepStrictEqual(libraryEngine.resolveVersionNumber.firstCall.args, [ {
                latestVersionTag: '1.0.0',
                mergedPullRequests: [ libraryRequest ],
                config: configuration
            } ]);
        });
    });

    suite('changelogs', function () {
        test('translates changelog rendering inputs', async function () {
            const { libraryRequest, request, libraryEngine, engine } = createEngine();
            const renderInput = {
                configuration,
                currentDate: new Date('2026-10-13'),
                mergedPullRequests: [ request ],
                githubRepository: 'owner/project',
                unreleased: false,
                versionNumber: '2.0.0'
            } as const;
            const libraryRenderInput = {
                config: configuration,
                currentDate: renderInput.currentDate,
                mergedPullRequests: [ libraryRequest ],
                githubRepo: 'owner/project',
                unreleased: false,
                versionNumber: '2.0.0'
            };
            assert.strictEqual(engine.renderChangelog(renderInput), 'changelog');
            assert.deepStrictEqual(libraryEngine.renderChangelog.firstCall.args, [ libraryRenderInput ]);
            assert.strictEqual(
                engine.renderTargetChangelog({ ...renderInput, targetName: 'package' }),
                'target changelog'
            );
            assert.deepStrictEqual(libraryEngine.renderTargetChangelog.firstCall.args, [ {
                ...libraryRenderInput,
                targetName: 'package'
            } ]);
        });

        test('translates grouped changelog entries', async function () {
            const { libraryRequest, request, libraryEngine, engine } = createEngine();
            const currentDate = new Date('2026-10-13');
            const target = {
                targetName: 'package',
                mergedPullRequests: [ request ],
                unreleased: false,
                versionNumber: '2.0.0'
            } as const;
            assert.strictEqual(
                engine.renderGroupedTargetChangelog({
                    configuration,
                    currentDate,
                    githubRepository: 'owner/project',
                    targets: [ target ]
                }),
                'grouped changelog'
            );
            assert.deepStrictEqual(libraryEngine.renderGroupedTargetChangelog.firstCall.args, [ {
                config: configuration,
                currentDate,
                githubRepo: 'owner/project',
                targets: [ { ...target, mergedPullRequests: [ libraryRequest ] } ]
            } ]);
        });

        test('preserves extraction and update results', async function () {
            const { extractedSection, libraryEngine, engine } = createEngine();
            const extraction = { changelogMarkdown: 'changelog', targetName: undefined, versionNumber: '2.0.0' };
            assert.strictEqual(engine.extractChangelogReleaseSection(extraction), extractedSection);
            assert.deepStrictEqual(libraryEngine.extractChangelogReleaseSection.firstCall.args, [ extraction ]);
            const update = { existingChangelogMarkdown: 'old', generatedChangelogMarkdown: 'new' };
            assert.strictEqual(engine.updateChangelog(update), 'updated changelog');
            assert.deepStrictEqual(libraryEngine.updateChangelog.firstCall.args, [ update ]);
        });
    });
});
