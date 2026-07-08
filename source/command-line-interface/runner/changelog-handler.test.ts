import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake, type SinonSpy } from 'sinon';
import { Result } from 'true-myth';
import type {
    CollectMergedPullRequestsOptions,
    PrLogEngine,
    PrLogEngineOptions,
    PullRequest,
    PullRequestWithLabel
} from '@pr-log/core';
import type { Packtory, ReleasePlanOutcome, ReleasePlanPackage, ReleasePlanResult } from '../../packtory/packtory.ts';
import { createFakeFileManager, type FakeFileManager } from '../../test-libraries/fake-file-manager.ts';
import type { TerminalSpinnerRenderer } from '../spinner/terminal-spinner-renderer.ts';
import type { ConfigLoader } from '../config-loader.ts';
import { runChangelogHandler, type ChangelogHandlerDeps } from './changelog-handler.ts';

function releasePackage(overrides: Partial<ReleasePlanPackage> = {}): ReleasePlanPackage {
    return {
        name: 'pkg-a',
        previousVersion: '1.0.0',
        nextVersion: '1.0.1',
        artifactState: 'changed',
        releaseClassification: 'substantive',
        changed: true,
        previousGitHead: 'old-head',
        currentGitHead: 'new-head',
        latestRegistryMetadata: undefined,
        artifactFiles: [ 'index.js' ],
        changedArtifactFiles: [ 'index.js' ],
        sourceFiles: [ 'source/pkg-a.ts' ],
        changelogSourceFiles: [ 'source/pkg-a.ts' ],
        changelogDependencyNames: [],
        ...overrides
    };
}

const validConfig = {
    packages: [
        {
            sourcesFolder: 'src/pkg-a',
            mainPackageJson: { type: 'module' },
            name: 'pkg-a',
            roots: { main: { js: 'index.js' } },
            publishSettings: { access: 'public' }
        }
    ]
} as const;

function releasePlanOutcomeFrom(result: ReleasePlanResult): ReleasePlanOutcome {
    return {
        result,
        getReport() {
            return {
                schemaVersion: 1 as const,
                generatedAt: '2026-06-13T00:00:00.000Z',
                packages: {},
                aggregate: { crossBundleLinks: [] }
            };
        }
    };
}

function outcome(packages: readonly ReleasePlanPackage[]): ReleasePlanOutcome {
    return releasePlanOutcomeFrom(Result.ok({ packages }));
}

function configFailureOutcome(issues: readonly string[]): ReleasePlanOutcome {
    return releasePlanOutcomeFrom(Result.err({ type: 'config', issues }));
}

function checkFailureOutcome(issues: readonly string[]): ReleasePlanOutcome {
    return releasePlanOutcomeFrom(Result.err({ type: 'checks', issues }));
}

type PartialFailureOutcomeSpec = {
    readonly succeeded: readonly ReleasePlanPackage[];
    readonly failures: readonly Error[];
};

function partialFailureOutcome(spec: PartialFailureOutcomeSpec): ReleasePlanOutcome {
    return releasePlanOutcomeFrom(Result.err({ type: 'partial', succeeded: spec.succeeded, failures: spec.failures }));
}

type PullRequestFilterInput = {
    readonly pullRequests: readonly PullRequest[];
};
type TargetChangelogInput = {
    readonly targetName: string;
};
type ChangelogUpdateInput = {
    readonly generatedChangelogMarkdown: string;
};
type ChangelogLabelInput = {
    readonly targetScopedLabelPattern: string;
    readonly validLabels: ReadonlyMap<string, string>;
};

type EngineOverrides = {
    readonly resolveChangelogBaseRef?: SinonSpy;
    readonly resolvePullRequestLabels?: SinonSpy;
    readonly readPullRequestChangedFiles?: SinonSpy;
};

function createEngine(overrides: EngineOverrides = {}): PrLogEngine {
    const pullRequests: readonly PullRequest[] = [ { id: 1, title: 'Fix package' } ];
    const labeledPullRequests: readonly PullRequestWithLabel[] = [ { id: 1, title: 'Fix package', label: 'bug' } ];

    return {
        resolveLatestSemverChangelogBaseRef: fake.resolves({ ref: 'latest-semver' }),
        resolveChangelogBaseRef: overrides.resolveChangelogBaseRef ?? fake.resolves({ ref: 'old-head' }),
        collectMergedPullRequests: fake.resolves(pullRequests),
        readPullRequestChangedFiles: overrides.readPullRequestChangedFiles ??
            fake.resolves(new Map([ [ 1, [ 'source/pkg-a.ts' ] ] ])),
        readPullRequestLabels: fake.resolves(new Map([ [ 1, [ 'bug' ] ] ])),
        filterPullRequestsByTargetFiles: fake(function (input: PullRequestFilterInput) {
            return input.pullRequests;
        }),
        resolvePullRequestLabels: overrides.resolvePullRequestLabels ?? fake.resolves(labeledPullRequests),
        renderGroupedTargetChangelog: fake.returns('## pkg-a 1.0.1\n'),
        renderTargetChangelog: fake(function (input: TargetChangelogInput) {
            return `## ${input.targetName} 1.0.1\n`;
        }),
        updateChangelog: fake(function (input: ChangelogUpdateInput) {
            return `merged:\n${input.generatedChangelogMarkdown}`;
        }),
        renderChangelog: fake.returns('')
    };
}

type Spies = {
    readonly createPrLogEngine: SinonSpy;
    readonly log: SinonSpy;
    readonly pageOutput: SinonSpy;
    readonly planReleaseAgainstLatestPublished: SinonSpy;
    readonly stopAll: SinonSpy;
};

function spinnerRendererCapturing(stopAll: SinonSpy): TerminalSpinnerRenderer {
    return { stopAll } as unknown as TerminalSpinnerRenderer;
}

function configLoaderReturning(config: unknown): ConfigLoader {
    return { load: fake.resolves(config) };
}

type ChangelogHandlerDepsSpec = {
    readonly spies: Spies;
    readonly configLoader?: ConfigLoader;
    readonly fileManager?: FakeFileManager;
    readonly readPackageInfo?: () => Promise<Readonly<Record<string, unknown>>>;
    readonly readEnvironmentVariable?: (name: 'GH_TOKEN' | 'GITHUB_TOKEN') => string | undefined;
};

function depsWith(spec: ChangelogHandlerDepsSpec): ChangelogHandlerDeps {
    return {
        log(message) {
            spec.spies.log(message);
        },
        pageOutput: spec.spies.pageOutput,
        packtory: {
            planReleaseAgainstLatestPublished: spec.spies.planReleaseAgainstLatestPublished
        } as unknown as Packtory,
        fileManager: spec.fileManager ?? createFakeFileManager(),
        spinnerRenderer: spinnerRendererCapturing(spec.spies.stopAll),
        configLoader: spec.configLoader ?? configLoaderReturning(validConfig),
        createPrLogEngine: spec.spies.createPrLogEngine,
        currentDate() {
            return new Date('2026-06-13T00:00:00.000Z');
        },
        readEnvironmentVariable: spec.readEnvironmentVariable ??
            function (name) {
                return name === 'GH_TOKEN' ? 'gh-token' : undefined;
            },
        readPackageInfo: spec.readPackageInfo ??
            async function () {
                return { repository: { url: 'git+https://github.com/Owner/Repo.git' } };
            },
        workingDirectory: '/repo'
    };
}

function assertMissingGitHubRepositoryLog(spies: Spies): void {
    assert.deepStrictEqual(spies.log.firstCall.args, [ 'package.json repository must point to a GitHub repository' ]);
}

function makeSpies(
    engine: PrLogEngine = createEngine(),
    releasePlanOutcome: ReleasePlanOutcome = outcome([ releasePackage() ])
): Spies {
    return {
        createPrLogEngine: fake(function (options: Readonly<PrLogEngineOptions>) {
            assert.partialDeepStrictEqual(options, {
                githubToken: 'gh-token',
                workingDirectory: '/repo'
            });
            return engine;
        }),
        log: fake(),
        pageOutput: fake.resolves(undefined),
        planReleaseAgainstLatestPublished: fake.resolves(releasePlanOutcome),
        stopAll: fake()
    };
}

type ReleasePlanFailureLogSpec = {
    readonly releasePlanOutcome: ReleasePlanOutcome;
    readonly expectedLog: string;
};

async function assertReleasePlanFailureLogged(spec: ReleasePlanFailureLogSpec): Promise<void> {
    const spies = makeSpies(createEngine(), spec.releasePlanOutcome);

    const code = await runChangelogHandler(depsWith({ spies }));

    assert.strictEqual(code, 1);
    assert.partialDeepStrictEqual(spies, {
        createPrLogEngine: {
            callCount: 0
        },
        log: {
            firstCall: {
                args: [ spec.expectedLog ]
            }
        }
    });
}

function assertConfiguredChangelogInputs(
    resolveChangelogBaseRef: SinonSpy,
    resolvePullRequestLabels: SinonSpy
): void {
    assert.deepStrictEqual(resolveChangelogBaseRef.firstCall.args[0], {
        packageName: 'pkg-a',
        previousVersion: '1.0.0',
        previousGitHead: 'old-head',
        packageTagFormat: 'pkg/{packageName}/v{version}',
        explicitBaseRef: 'main'
    });
    const labelInput = resolvePullRequestLabels.firstCall.args[0] as ChangelogLabelInput;
    assert.strictEqual(labelInput.targetScopedLabelPattern, 'scope:{targetName}:{label}');
    assert.strictEqual(labelInput.validLabels.get('bug'), 'Bug Fixes');
    assert.strictEqual(labelInput.validLabels.get('operations'), 'Operations');
}

suite('changelog-handler', function () {
    suite('release output', function () {
        test('loads config, plans the release, and renders changelog markdown through the pager', async function () {
            const spies = makeSpies();

            const code = await runChangelogHandler(depsWith({ spies }));

            assert.strictEqual(code, 0);
            assert.partialDeepStrictEqual(spies, {
                planReleaseAgainstLatestPublished: {
                    firstCall: {
                        args: [ validConfig ]
                    }
                },
                createPrLogEngine: {
                    callCount: 1
                },
                pageOutput: {
                    firstCall: {
                        args: [ '## pkg-a 1.0.1\n' ]
                    }
                },
                stopAll: {
                    callCount: 2
                }
            });
        });

        test('returns 1 and logs release-plan config failures without creating pr-log', async function () {
            await assertReleasePlanFailureLogged({
                releasePlanOutcome: configFailureOutcome([ 'bad config', 'worse config' ]),
                expectedLog: 'Configuration issues, there are 2 issue(s)\n\n- bad config\n- worse config'
            });
        });

        test('returns 1 and logs release-plan check failures without creating pr-log', async function () {
            await assertReleasePlanFailureLogged({
                releasePlanOutcome: checkFailureOutcome([ 'bad package', 'worse package' ]),
                expectedLog: 'Check issues, there are 2 issue(s)\n\n- bad package\n- worse package'
            });
        });

        test('does not render changelog output when the loaded config cannot be parsed', async function () {
            const spies = makeSpies();

            const code = await runChangelogHandler(
                depsWith({
                    spies,
                    configLoader: configLoaderReturning({ packages: [] })
                })
            );

            assert.strictEqual(code, 0);
            assert.partialDeepStrictEqual(spies, {
                createPrLogEngine: {
                    callCount: 0
                },
                pageOutput: {
                    callCount: 0
                }
            });
        });

        test('returns 1 and still renders succeeded changed packages for partial release-plan failures', async function () {
            const releasePlanOutcome = partialFailureOutcome({
                succeeded: [ releasePackage() ],
                failures: [ new Error('pkg-b failed'), new Error('pkg-c failed') ]
            });
            const spies = makeSpies(createEngine(), releasePlanOutcome);

            const code = await runChangelogHandler(depsWith({ spies }));

            assert.strictEqual(code, 1);
            assert.partialDeepStrictEqual(spies, {
                pageOutput: {
                    callCount: 1
                },
                log: {
                    firstCall: {
                        args: [ 'pkg-b failed\npkg-c failed' ]
                    }
                }
            });
        });
    });

    suite('github inputs', function () {
        test('uses GITHUB_TOKEN when GH_TOKEN is not set', async function () {
            const engine = createEngine();
            const createPrLogEngine = fake(function (options: Readonly<PrLogEngineOptions>) {
                assert.strictEqual(options.githubToken, 'github-token');
                return engine;
            });
            const spies: Spies = {
                ...makeSpies(engine),
                createPrLogEngine
            };

            const code = await runChangelogHandler(
                depsWith({
                    spies,
                    readEnvironmentVariable(name) {
                        return name === 'GITHUB_TOKEN' ? 'github-token' : undefined;
                    }
                })
            );

            assert.strictEqual(code, 0);
            assert.strictEqual(createPrLogEngine.callCount, 1);
        });

        test('passes the GitHub repo from package metadata into pr-log', async function () {
            const collectMergedPullRequests = fake(async function (input: CollectMergedPullRequestsOptions) {
                assert.strictEqual(input.githubRepo, 'owner/repo');
                return [];
            });
            const engine = {
                ...createEngine(),
                collectMergedPullRequests
            };
            const spies = makeSpies(engine);

            const code = await runChangelogHandler(depsWith({ spies }));

            assert.strictEqual(code, 0);
            assert.strictEqual(collectMergedPullRequests.callCount, 1);
        });

        test('passes configured changelog label and base-ref settings into pr-log', async function () {
            const resolveChangelogBaseRef = fake.resolves({ ref: 'configured-base' });
            const resolvePullRequestLabels = fake.resolves([ { id: 1, title: 'Fix package', label: 'operations' } ]);
            const engine = createEngine({ resolveChangelogBaseRef, resolvePullRequestLabels });
            const spies = makeSpies(engine);

            const code = await runChangelogHandler(
                depsWith({
                    spies,
                    configLoader: configLoaderReturning({
                        ...validConfig,
                        changelog: {
                            explicitBaseRef: 'main',
                            labels: { operations: 'Operations' },
                            packageTagFormat: 'pkg/{packageName}/v{version}',
                            targetScopedLabelPattern: 'scope:{targetName}:{label}'
                        }
                    })
                })
            );

            assert.strictEqual(code, 0);
            assertConfiguredChangelogInputs(resolveChangelogBaseRef, resolvePullRequestLabels);
        });
    });

    suite('repository validation', function () {
        test('returns 1 when package.json repository is not a GitHub repository', async function () {
            const spies = makeSpies();

            const code = await runChangelogHandler(
                depsWith({
                    spies,
                    async readPackageInfo() {
                        return { repository: { url: 'https://example.com/owner/repo' } };
                    }
                })
            );

            assert.strictEqual(code, 1);
            assert.partialDeepStrictEqual(spies, {
                log: {
                    firstCall: {
                        args: [
                            'package.json repository must point to a GitHub repository'
                        ]
                    }
                },
                pageOutput: {
                    callCount: 0
                }
            });
        });

        test('returns 1 when package.json repository is missing', async function () {
            const spies = makeSpies();

            const code = await runChangelogHandler(
                depsWith({
                    spies,
                    async readPackageInfo() {
                        return {};
                    }
                })
            );

            assert.strictEqual(code, 1);
            assertMissingGitHubRepositoryLog(spies);
        });

        test('returns 1 when package.json repository has a GitHub owner but no repo', async function () {
            const spies = makeSpies();

            const code = await runChangelogHandler(
                depsWith({
                    spies,
                    async readPackageInfo() {
                        return { repository: { url: 'https://github.com/owner' } };
                    }
                })
            );

            assert.strictEqual(code, 1);
            assertMissingGitHubRepositoryLog(spies);
        });

        test('returns 1 when package.json repository only contains a GitHub URL suffix', async function () {
            const spies = makeSpies();

            const code = await runChangelogHandler(
                depsWith({
                    spies,
                    async readPackageInfo() {
                        return { repository: { url: 'https://example.com/https://github.com/owner/repo' } };
                    }
                })
            );

            assert.strictEqual(code, 1);
            assertMissingGitHubRepositoryLog(spies);
        });

        test('returns 1 when package.json repository contains extra path segments after repo', async function () {
            const spies = makeSpies();

            const code = await runChangelogHandler(
                depsWith({
                    spies,
                    async readPackageInfo() {
                        return { repository: { url: 'https://github.com/owner/repo/extra' } };
                    }
                })
            );

            assert.strictEqual(code, 1);
            assertMissingGitHubRepositoryLog(spies);
        });
    });

    suite('failure formatting', function () {
        test('does not page empty changelog output for changed packages', async function () {
            const engine = {
                ...createEngine(),
                renderGroupedTargetChangelog: fake.returns('')
            };
            const spies = makeSpies(engine);

            const code = await runChangelogHandler(depsWith({ spies }));

            assert.strictEqual(code, 0);
            assert.strictEqual(spies.pageOutput.callCount, 0);
        });

        test('strips leading TypeError prefixes from thrown errors', async function () {
            const spies = makeSpies();

            const code = await runChangelogHandler(
                depsWith({
                    spies,
                    configLoader: {
                        load: fake.rejects(new TypeError('bad config'))
                    }
                })
            );

            assert.strictEqual(code, 1);
            assert.deepStrictEqual(spies.log.firstCall.args, [ 'bad config' ]);
        });

        test('does not strip Error text that is not at the start of the message', async function () {
            const spies = makeSpies();

            const code = await runChangelogHandler(
                depsWith({
                    spies,
                    configLoader: {
                        async load() {
                            throw new Error('prefix Error: bad config');
                        }
                    }
                })
            );

            assert.strictEqual(code, 1);
            assert.deepStrictEqual(spies.log.firstCall.args, [ 'prefix Error: bad config' ]);
        });

        test('does not strip embedded Error text from non-Error thrown values', async function () {
            const spies = makeSpies();
            const rejection = {
                toString() {
                    return 'prefix Error: bad config';
                }
            };
            const rejectedConfigLoad = {
                then(_resolve: (value: unknown) => void, reject: (reason: unknown) => void) {
                    reject(rejection);
                }
            } as unknown as Promise<unknown>;

            const code = await runChangelogHandler(
                depsWith({
                    spies,
                    configLoader: {
                        async load() {
                            return await rejectedConfigLoad;
                        }
                    }
                })
            );

            assert.strictEqual(code, 1);
            assert.deepStrictEqual(spies.log.firstCall.args, [ 'prefix Error: bad config' ]);
        });
    });
});
