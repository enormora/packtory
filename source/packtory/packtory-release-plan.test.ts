import assert from 'node:assert';
import vm from 'node:vm';
import { suite, test } from 'mocha';
import { Result } from 'true-myth';
import { analyzedBundleResource } from '../test-libraries/bundle-fixtures.ts';
import {
    buildResultFor,
    createReleaseTestDependencies,
    packageProcessorCheckingStage,
    packageProcessorWithFailure,
    previousReleaseArtifactsFor,
    validatedReleaseConfig,
    resolvedPackagesFor as sharedResolvedPackagesFor,
    validatedReleaseConfigFor,
    type ReleaseFileCollection
} from '../test-libraries/release-orchestrator-fixtures.ts';
import { createPlanReleaseAgainstLatestPublishedValidated } from './packtory-release-plan.ts';
import type { ReleasePlanResult, ResolveAndLinkFailure } from './packtory-results.ts';
import type { ResolvedPackage } from './resolved-package.ts';

type ReleaseTestDependencies = ReturnType<typeof createReleaseTestDependencies>;
type BuildAndPublishResult = Awaited<ReturnType<ReleaseTestDependencies['packageProcessor']['tryBuildAndPublish']>>;
type PackageProcessor = ReleaseTestDependencies['packageProcessor'];
type FileCollection = ReleaseFileCollection;
type ReleasePlanFileManager = ReleaseTestDependencies['fileManager'];
type ReleaseArtifactFile = { readonly content: string; readonly filePath: string; readonly isExecutable: false };
type ValidatedReleaseConfig = ReturnType<typeof validatedReleaseConfig>;
type TestPullRequest = { readonly id: number; readonly title: string };
type PathFilterInput = {
    readonly pullRequests: readonly TestPullRequest[];
    readonly changedFilesByPullRequest: ReadonlyMap<number, readonly string[]>;
    readonly targetSourceFiles: readonly string[];
    readonly ignoredAttributionPaths: readonly string[];
};
type ChangelogRenderInput = {
    readonly targetName: string;
    readonly mergedPullRequests: readonly TestPullRequest[];
};
type GroupedChangelogRenderInput = {
    readonly targets: readonly ChangelogRenderInput[];
};
type PullRequestLabelInput = {
    readonly pullRequests: readonly TestPullRequest[];
};

function createPlanner(spec: {
    readonly packageNames: readonly string[];
    readonly buildResults?: readonly BuildAndPublishResult[];
    readonly collectContents?: FileCollection;
    readonly currentGitHead?: string | undefined;
    readonly fileManager?: ReleasePlanFileManager | undefined;
    readonly packageProcessor?: PackageProcessor;
    readonly repositoryFolder?: string | undefined;
}) {
    return createPlanReleaseAgainstLatestPublishedValidated(createReleaseTestDependencies(spec));
}

function resolvedPackagesFor(
    validated: ValidatedReleaseConfig,
    bundleContents: Readonly<Record<string, readonly ReturnType<typeof analyzedBundleResource>[]>> = {}
): readonly ResolvedPackage[] {
    return sharedResolvedPackagesFor(validated, {
        bundleContents,
        defaultContents(packageName) {
            return [analyzedBundleResource(`/source/${packageName}.js`, { targetFilePath: 'index.js' })];
        }
    });
}

async function planFor(spec: {
    readonly packageNames: readonly string[];
    readonly buildResults: readonly BuildAndPublishResult[];
    readonly collectContents: FileCollection;
    readonly bundleContents?: Readonly<Record<string, readonly ReturnType<typeof analyzedBundleResource>[]>>;
    readonly currentGitHead?: string | undefined;
    readonly fileManager?: ReleasePlanFileManager | undefined;
    readonly repositoryFolder?: string | undefined;
}): Promise<ReleasePlanResult> {
    const validated = validatedReleaseConfigFor(spec.packageNames);
    const plan = createPlanner({
        packageNames: spec.packageNames,
        buildResults: spec.buildResults,
        collectContents: spec.collectContents,
        currentGitHead: spec.currentGitHead,
        fileManager: spec.fileManager,
        repositoryFolder: spec.repositoryFolder
    });

    return plan(validated, async () => {
        return Result.ok<readonly ResolvedPackage[], ResolveAndLinkFailure>(
            resolvedPackagesFor(validated, spec.bundleContents)
        );
    });
}

function publishedBuildResultFor(status: BuildAndPublishResult['status'] = 'new-version'): BuildAndPublishResult {
    return buildResultFor({
        status,
        packageName: 'pkg-a',
        previousReleaseArtifacts: previousReleaseArtifactsFor({
            version: '1.0.0',
            publishedAt: new Date('2026-05-01T00:00:00.000Z'),
            files: [
                { filePath: 'package/index.js', content: 'old', isExecutable: false },
                { filePath: 'package/removed.js', content: 'removed', isExecutable: false }
            ]
        })
    });
}

function releaseArtifactFile(filePath: string, content: string): ReleaseArtifactFile {
    return { filePath, content, isExecutable: false };
}

function packageManifest(content: string): ReleaseArtifactFile {
    return releaseArtifactFile('package/package.json', content);
}

function validatedManifestAttributionConfig(): ValidatedReleaseConfig {
    return validatedReleaseConfig({
        registrySettings: { auth: { type: 'bearer-token', token: 'token' } },
        commonPackageSettings: {
            additionalChangelogSourceFiles: [
                'npm-shrinkwrap.json',
                'package-lock.json',
                'packtory.config.js',
                'pnpm-lock.yaml',
                'yarn.lock'
            ],
            mainPackageJson: { type: 'module', dependencies: { commander: '^14.0.0' } },
            publishSettings: { access: 'public' },
            sourcesFolder: 'source'
        },
        packages: [{ name: 'pkg-a', roots: { main: { js: 'pkg-a.js' } } }]
    });
}

function expectPlan(result: ReleasePlanResult) {
    if (result.isErr) {
        assert.fail(`Expected release plan, got ${result.error.type}`);
    }
    return result.value;
}

async function planPackageManifestFiles(
    previousFiles: readonly ReleaseArtifactFile[],
    currentFiles: readonly ReleaseArtifactFile[]
) {
    const validated = validatedManifestAttributionConfig();
    const plan = createPlanner({
        packageNames: ['pkg-a'],
        buildResults: [
            buildResultFor({
                previousReleaseArtifacts: previousReleaseArtifactsFor({
                    version: '1.0.0',
                    publishedAt: new Date('2026-05-01T00:00:00.000Z'),
                    files: previousFiles
                })
            })
        ],
        collectContents() {
            return currentFiles;
        }
    });

    const result = await plan(validated, async () => {
        return Result.ok<readonly ResolvedPackage[], ResolveAndLinkFailure>(resolvedPackagesFor(validated));
    });

    const packagePlan = expectPlan(result).packages[0];
    assert.ok(packagePlan);
    return packagePlan;
}

async function planManifestPackage(spec: {
    readonly currentIndex: string;
    readonly currentPackageJson: string;
    readonly previousIndex: string;
    readonly previousPackageJson: string;
}) {
    return planPackageManifestFiles(
        [releaseArtifactFile('package/index.js', spec.previousIndex), packageManifest(spec.previousPackageJson)],
        [releaseArtifactFile('package/index.js', spec.currentIndex), packageManifest(spec.currentPackageJson)]
    );
}

async function planManifestAttribution(spec: {
    readonly currentIndex: string;
    readonly currentPackageJson: string;
    readonly previousIndex: string;
    readonly previousPackageJson: string;
}): Promise<readonly string[]> {
    const packagePlan = await planManifestPackage(spec);
    return packagePlan.changelogSourceFiles;
}

function expectPartialFailure(result: ReleasePlanResult) {
    if (result.isOk || result.error.type !== 'partial') {
        assert.fail('Expected a partial release-plan failure');
    }
    return result.error;
}

function createPathFilteringChangelogEngine(
    pullRequests: readonly TestPullRequest[],
    changedFilesByPullRequest: ReadonlyMap<number, readonly string[]>
) {
    return {
        collectMergedPullRequests: async () => {
            return pullRequests;
        },
        readPullRequestChangedFiles: async () => {
            return changedFilesByPullRequest;
        },
        filterPullRequestsByTargetFiles(input: PathFilterInput) {
            return input.pullRequests.filter((pullRequest) => {
                const changedFiles = input.changedFilesByPullRequest.get(pullRequest.id) ?? [];
                return changedFiles.some((filePath) => {
                    return (
                        input.targetSourceFiles.includes(filePath) && !input.ignoredAttributionPaths.includes(filePath)
                    );
                });
            });
        },
        renderGroupedTargetChangelog(input: GroupedChangelogRenderInput) {
            return input.targets
                .map((target) => {
                    return `${target.targetName}:${target.mergedPullRequests
                        .map((pullRequest) => {
                            return pullRequest.id;
                        })
                        .join(',')}`;
                })
                .join('\n');
        },
        renderTargetChangelog(input: ChangelogRenderInput) {
            return `${input.targetName}:${input.mergedPullRequests
                .map((pullRequest) => {
                    return pullRequest.id;
                })
                .join(',')}`;
        },
        resolveChangelogBaseRef: async () => {
            return { ref: 'base' };
        },
        resolveLatestSemverChangelogBaseRef: async () => {
            return { ref: 'base' };
        },
        resolvePullRequestLabels: async (input: PullRequestLabelInput) => {
            return input.pullRequests.map((pullRequest) => {
                return { ...pullRequest, label: 'bug' };
            });
        }
    };
}

suite('packtory-release-plan', function () {
    test('runs dry-run release planning with staged publishing disabled', async function () {
        const validated = validatedReleaseConfigFor(['pkg-a']);
        const plan = createPlanner({
            packageNames: ['pkg-a'],
            packageProcessor: packageProcessorCheckingStage(false)
        });

        const result = await plan(validated, async () => {
            return Result.ok<readonly ResolvedPackage[], ResolveAndLinkFailure>(resolvedPackagesFor(validated));
        });

        assert.strictEqual(result.isOk, true);
    });

    test('plans first publishes with all current artifact files marked as changed', async function () {
        const result = await planFor({
            packageNames: ['pkg-a'],
            buildResults: [buildResultFor({ status: 'initial-version', version: '0.1.0' })],
            collectContents(_bundle, prefix) {
                assert.strictEqual(prefix, 'package');
                return [
                    { filePath: 'package/package.json', content: '{}', isExecutable: false },
                    { filePath: 'package/index.js', content: 'new', isExecutable: false },
                    { filePath: 'readme.md', content: 'readme', isExecutable: false }
                ];
            }
        });

        assert.deepStrictEqual(expectPlan(result).packages, [
            {
                name: 'pkg-a',
                previousVersion: undefined,
                nextVersion: '0.1.0',
                artifactState: 'first-publish',
                releaseClassification: 'first-publish',
                changed: true,
                previousGitHead: undefined,
                currentGitHead: undefined,
                latestRegistryMetadata: undefined,
                artifactFiles: ['index.js', 'package.json', 'readme.md'],
                changedArtifactFiles: ['index.js', 'package.json', 'readme.md'],
                sourceFiles: ['/source/pkg-a.js'],
                changelogDependencyNames: [],
                changelogSourceFiles: ['source/pkg-a.js']
            }
        ]);
    });

    test('plans changed packages from added, removed, and modified artifact paths', async function () {
        const result = await planFor({
            packageNames: ['pkg-a'],
            buildResults: [publishedBuildResultFor()],
            collectContents() {
                return [
                    { filePath: 'package/index.js', content: 'new', isExecutable: false },
                    { filePath: 'package/extra.js', content: 'extra', isExecutable: false }
                ];
            }
        });

        assert.deepStrictEqual(expectPlan(result).packages[0], {
            name: 'pkg-a',
            previousVersion: '1.0.0',
            nextVersion: '1.0.1',
            artifactState: 'changed',
            releaseClassification: 'substantive',
            changed: true,
            latestRegistryMetadata: {
                version: '1.0.0',
                publishedAt: new Date('2026-05-01T00:00:00.000Z'),
                gitHead: undefined
            },
            previousGitHead: undefined,
            currentGitHead: undefined,
            artifactFiles: ['extra.js', 'index.js'],
            changedArtifactFiles: ['extra.js', 'index.js', 'removed.js'],
            sourceFiles: ['/source/pkg-a.js'],
            changelogDependencyNames: [],
            changelogSourceFiles: ['source/pkg-a.js']
        });
    });

    test('plans unchanged packages with current artifact files and no changed files', async function () {
        const result = await planFor({
            packageNames: ['pkg-a'],
            buildResults: [publishedBuildResultFor('already-published')],
            collectContents() {
                return [{ filePath: 'package/index.js', content: 'old', isExecutable: false }];
            }
        });

        assert.deepStrictEqual(expectPlan(result).packages[0], {
            name: 'pkg-a',
            previousVersion: '1.0.0',
            nextVersion: '1.0.1',
            artifactState: 'unchanged',
            releaseClassification: 'unchanged',
            changed: false,
            latestRegistryMetadata: {
                version: '1.0.0',
                publishedAt: new Date('2026-05-01T00:00:00.000Z'),
                gitHead: undefined
            },
            previousGitHead: undefined,
            currentGitHead: undefined,
            artifactFiles: ['index.js'],
            changedArtifactFiles: [],
            sourceFiles: ['/source/pkg-a.js'],
            changelogDependencyNames: [],
            changelogSourceFiles: ['source/pkg-a.js']
        });
    });

    test('preserves succeeded package plans when a later dry-run publish fails', async function () {
        const validated = validatedReleaseConfigFor(['pkg-a', 'pkg-b']);
        const failure = new Error('publish failed');
        const plan = createPlanner({
            packageNames: ['pkg-a', 'pkg-b'],
            packageProcessor: packageProcessorWithFailure([buildResultFor({ packageName: 'pkg-a' })], failure),
            collectContents() {
                return [{ filePath: 'package/index.js', content: 'new', isExecutable: false }];
            }
        });

        const partial = expectPartialFailure(
            await plan(validated, async () => {
                return Result.ok<readonly ResolvedPackage[], ResolveAndLinkFailure>(resolvedPackagesFor(validated));
            })
        );

        assert.strictEqual(partial.succeeded.length, 1);
        assert.strictEqual(partial.succeeded[0]?.name, 'pkg-a');
        assert.deepStrictEqual(partial.failures, [failure]);
    });

    test('plans previous and current git heads for published packages', async function () {
        const result = await planFor({
            packageNames: ['pkg-a'],
            buildResults: [
                buildResultFor({
                    previousReleaseArtifacts: previousReleaseArtifactsFor({
                        version: '1.0.0',
                        publishedAt: new Date('2026-05-01T00:00:00.000Z'),
                        gitHead: 'old-head',
                        files: [{ filePath: 'package/index.js', content: 'old', isExecutable: false }]
                    })
                })
            ],
            currentGitHead: 'current-head',
            collectContents() {
                return [{ filePath: 'package/index.js', content: 'new', isExecutable: false }];
            }
        });

        const [pkg] = expectPlan(result).packages;
        assert.ok(pkg);
        assert.strictEqual(pkg.previousGitHead, 'old-head');
        assert.strictEqual(pkg.currentGitHead, 'current-head');
        assert.strictEqual(pkg.latestRegistryMetadata?.gitHead, 'old-head');
    });

    test('returns a partial failure when building a package plan throws after publish succeeds', async function () {
        const result = await planFor({
            packageNames: ['pkg-a'],
            buildResults: [buildResultFor()],
            collectContents() {
                throw new Error('collect failed');
            }
        });

        const partial = expectPartialFailure(result);
        assert.deepStrictEqual(partial.succeeded, []);
        assert.match(partial.failures[0]?.message ?? '', /collect failed/u);
    });

    test('returns a partial failure when changelog source attribution fails', async function () {
        const result = await planFor({
            packageNames: ['pkg-a'],
            buildResults: [buildResultFor()],
            collectContents() {
                return [{ filePath: 'package/index.js', content: 'new', isExecutable: false }];
            },
            fileManager: {
                async checkReadability() {
                    return { isReadable: false };
                },
                async readFile() {
                    return 'export {};\n//# sourceMappingURL=index.js.map';
                }
            }
        });

        const partial = expectPartialFailure(result);
        assert.deepStrictEqual(partial.succeeded, []);
        assert.match(partial.failures[0]?.message ?? '', /Source map "\/source\/index\.js\.map".*not readable/u);
    });

    test('returns a partial failure when a publish result has no matching resolved package', async function () {
        const result = await planFor({
            packageNames: ['pkg-a'],
            buildResults: [buildResultFor({ packageName: 'pkg-other' })],
            collectContents() {
                return [{ filePath: 'package/index.js', content: 'new', isExecutable: false }];
            }
        });

        const partial = expectPartialFailure(result);
        assert.deepStrictEqual(partial.succeeded, []);
        assert.match(partial.failures[0]?.message ?? '', /Resolved package "pkg-other" is missing/u);
    });

    test('wraps non-Error plan failures in Error objects', async function () {
        const result = await planFor({
            packageNames: ['pkg-a'],
            buildResults: [buildResultFor()],
            collectContents() {
                return vm.runInNewContext("throw 'collect failed'") as readonly {
                    readonly content: string;
                    readonly filePath: string;
                    readonly isExecutable: false;
                }[];
            }
        });

        const partial = expectPartialFailure(result);
        assert.match(partial.failures[0]?.message ?? '', /collect failed/u);
    });

    test('falls back to plan-stage succeeded entries when publish and plan mapping both fail', async function () {
        const validated = validatedReleaseConfigFor(['pkg-a', 'pkg-b']);
        const plan = createPlanner({
            packageNames: ['pkg-a', 'pkg-b'],
            packageProcessor: packageProcessorWithFailure(
                [buildResultFor({ packageName: 'pkg-a' })],
                new Error('publish failed')
            ),
            collectContents() {
                throw new Error('collect failed');
            }
        });

        const partial = expectPartialFailure(
            await plan(validated, async () => {
                return Result.ok<readonly ResolvedPackage[], ResolveAndLinkFailure>(resolvedPackagesFor(validated));
            })
        );

        assert.deepStrictEqual(partial.succeeded, []);
        assert.match(partial.failures[0]?.message ?? '', /publish failed/u);
    });

    test('passes non-partial resolve failures through unchanged', async function () {
        const releasePlan = createPlanner({ packageNames: [] });
        const validated = validatedReleaseConfigFor(['pkg-a']);
        const stopWithConfigFailure = async () => {
            return Result.err<readonly ResolvedPackage[], ResolveAndLinkFailure>({
                type: 'config',
                issues: ['bad']
            });
        };

        const result = await releasePlan(validated, stopWithConfigFailure);

        if (result.isErr) {
            assert.strictEqual(result.error.type, 'config');
            return;
        }

        assert.fail('Expected an error result');
    });

    test('attributes only source files for changed artifacts in substantive releases', async function () {
        const generatedManifest = {
            ...analyzedBundleResource('/source/package.json', { targetFilePath: 'package.json' }),
            isGeneratedManifest: true as const
        };
        const result = await planFor({
            packageNames: ['pkg-a'],
            buildResults: [buildResultFor()],
            collectContents() {
                return [{ filePath: 'package/index.js', content: 'new', isExecutable: false }];
            },
            bundleContents: {
                'pkg-a': [
                    generatedManifest,
                    analyzedBundleResource('/source/index.js', { targetFilePath: 'index.js' }),
                    analyzedBundleResource('/source/index.js', { targetFilePath: 'index.js' }),
                    analyzedBundleResource('/source/substituted.js', {
                        isSubstituted: true,
                        targetFilePath: 'substituted.js'
                    }),
                    analyzedBundleResource('/assets/readme.md', { targetFilePath: 'readme.md' })
                ]
            }
        });

        assert.deepStrictEqual(expectPlan(result).packages[0]?.sourceFiles, [
            '/assets/readme.md',
            '/source/index.js',
            '/source/substituted.js'
        ]);
        assert.deepStrictEqual(expectPlan(result).packages[0]?.changelogSourceFiles, ['source/index.js']);
    });

    test('tracks generated package manifest dependency changes separately from source files', async function () {
        const packagePlan = await planManifestPackage({
            currentIndex: 'same',
            currentPackageJson: '{"name":"pkg-a","version":"1.0.1","dependencies":{"commander":"^14.0.0"}}',
            previousIndex: 'same',
            previousPackageJson: '{"name":"pkg-a","version":"1.0.0","dependencies":{"commander":"^13.0.0"}}'
        });

        assert.deepStrictEqual(packagePlan.changelogSourceFiles, ['source/pkg-a.js']);
        assert.deepStrictEqual(packagePlan.changelogDependencyNames, ['commander']);
    });

    test('skips root package manifest inputs when generated package manifests do not change', async function () {
        const packageJsonContent = '{"name":"pkg-a","version":"1.0.1","dependencies":{"commander":"^14.0.0"}}';

        assert.deepStrictEqual(
            await planManifestAttribution({
                currentIndex: 'new',
                currentPackageJson: packageJsonContent,
                previousIndex: 'old',
                previousPackageJson: packageJsonContent
            }),
            ['source/pkg-a.js']
        );
    });

    test('skips root package manifest inputs when only generated package manifest versions change', async function () {
        const packagePlan = await planManifestPackage({
            currentIndex: 'same',
            currentPackageJson: '{"name":"pkg-a","version":"1.0.1","dependencies":{"commander":"^14.0.0"}}',
            previousIndex: 'same',
            previousPackageJson: '{"name":"pkg-a","version":"1.0.0","dependencies":{"commander":"^14.0.0"}}'
        });

        assert.deepStrictEqual(packagePlan.changelogSourceFiles, ['source/pkg-a.js']);
        assert.deepStrictEqual(packagePlan.changelogDependencyNames, []);
    });

    test('skips dependency attribution when the previous generated package manifest is missing', async function () {
        const packagePlan = await planPackageManifestFiles(
            [releaseArtifactFile('package/index.js', 'same')],
            [
                releaseArtifactFile('package/index.js', 'same'),
                packageManifest('{"name":"pkg-a","version":"1.0.1","dependencies":{"commander":"^14.0.0"}}')
            ]
        );

        assert.deepStrictEqual(packagePlan.changelogDependencyNames, []);
    });

    test('skips dependency attribution when the current generated package manifest is missing', async function () {
        const packagePlan = await planPackageManifestFiles(
            [
                releaseArtifactFile('package/index.js', 'same'),
                packageManifest('{"name":"pkg-a","version":"1.0.0","dependencies":{"commander":"^13.0.0"}}')
            ],
            [releaseArtifactFile('package/index.js', 'same')]
        );

        assert.deepStrictEqual(packagePlan.changelogDependencyNames, []);
    });

    test('keeps package-level explicit changelog source files in package attribution', async function () {
        const validated = validatedReleaseConfig({
            registrySettings: { auth: { type: 'bearer-token', token: 'token' } },
            commonPackageSettings: {
                additionalChangelogSourceFiles: ['packtory.config.js'],
                mainPackageJson: { type: 'module' },
                publishSettings: { access: 'public' },
                sourcesFolder: 'source'
            },
            packages: [
                {
                    additionalChangelogSourceFiles: ['packages/pkg-a/release-notes.md'],
                    name: 'pkg-a',
                    roots: { main: { js: 'pkg-a.js' } }
                }
            ]
        });
        const plan = createPlanner({
            packageNames: ['pkg-a'],
            buildResults: [publishedBuildResultFor()],
            collectContents() {
                return [releaseArtifactFile('package/index.js', 'new')];
            }
        });

        const result = await plan(validated, async () => {
            return Result.ok<readonly ResolvedPackage[], ResolveAndLinkFailure>(resolvedPackagesFor(validated));
        });

        assert.deepStrictEqual(expectPlan(result).packages[0]?.changelogSourceFiles, [
            'packages/pkg-a/release-notes.md',
            'source/pkg-a.js'
        ]);
    });

    test('attributes changelog entries through package artifact inputs', async function () {
        const validated = validatedReleaseConfig({
            registrySettings: { auth: { type: 'bearer-token', token: 'token' } },
            commonPackageSettings: {
                additionalChangelogSourceFiles: ['package-lock.json', 'packtory.config.js'],
                mainPackageJson: { type: 'module' },
                publishSettings: { access: 'public' },
                sourcesFolder: 'source'
            },
            packages: [
                {
                    name: 'pkg-a',
                    mainPackageJson: { type: 'module', dependencies: { commander: '^14.0.0' } },
                    roots: { main: { js: 'pkg-a.js' } }
                },
                { name: 'pkg-b', roots: { main: { js: 'pkg-b.js' } } }
            ]
        });
        const plan = createPlanner({
            packageNames: ['pkg-a', 'pkg-b'],
            buildResults: [
                buildResultFor({
                    packageName: 'pkg-a',
                    previousReleaseArtifacts: previousReleaseArtifactsFor({
                        version: '1.0.0',
                        publishedAt: new Date('2026-05-01T00:00:00.000Z'),
                        files: [
                            packageManifest(
                                '{"name":"pkg-a","version":"1.0.0","dependencies":{"commander":"^13.0.0"}}'
                            ),
                            releaseArtifactFile('package/index.js', 'stable')
                        ]
                    })
                }),
                buildResultFor({
                    packageName: 'pkg-b',
                    previousReleaseArtifacts: previousReleaseArtifactsFor({
                        version: '1.0.0',
                        publishedAt: new Date('2026-05-01T00:00:00.000Z'),
                        files: [
                            packageManifest('{"name":"pkg-b","version":"1.0.0"}'),
                            releaseArtifactFile('package/index.js', 'old')
                        ]
                    })
                })
            ],
            collectContents(bundle) {
                if (bundle.name === 'pkg-a') {
                    return [
                        packageManifest('{"name":"pkg-a","version":"1.0.1","dependencies":{"commander":"^14.0.0"}}'),
                        releaseArtifactFile('package/index.js', 'stable')
                    ];
                }

                return [
                    packageManifest('{"name":"pkg-b","version":"1.0.1"}'),
                    releaseArtifactFile('package/index.js', 'new')
                ];
            }
        });

        const result = await plan(validated, async () => {
            return Result.ok<readonly ResolvedPackage[], ResolveAndLinkFailure>(resolvedPackagesFor(validated));
        });
        const releasePlan = expectPlan(result);
        const { generateChangelogOutputs } = await import('./packtory-changelog.ts');
        const changelog = await generateChangelogOutputs({
            packages: releasePlan.packages,
            prLogEngine: createPathFilteringChangelogEngine(
                [
                    { id: 1, title: 'Update dependency commander to v14' },
                    { id: 2, title: 'Update @packtory/cli to 0.0.42' },
                    { id: 3, title: 'Adopt Packtory release workflow' },
                    { id: 4, title: 'Fix pkg-b source' }
                ],
                new Map([
                    [1, ['package.json', 'package-lock.json']],
                    [2, ['package.json', 'package-lock.json']],
                    [3, ['.github/workflows/release.yml']],
                    [4, ['source/pkg-b.js']]
                ])
            ),
            explicitBaseRef: undefined,
            githubRepo: 'owner/repo',
            packageInfo: {},
            packageTagFormat: undefined,
            currentDate: new Date('2026-06-13T00:00:00.000Z'),
            ignoredAttributionPaths: [],
            targetScopedLabelPattern: undefined,
            validLabels: new Map([['bug', 'Bug Fixes']])
        });

        assert.deepStrictEqual(
            releasePlan.packages.map((packagePlan) => {
                return {
                    name: packagePlan.name,
                    changelogDependencyNames: packagePlan.changelogDependencyNames,
                    changelogSourceFiles: packagePlan.changelogSourceFiles
                };
            }),
            [
                {
                    name: 'pkg-a',
                    changelogDependencyNames: ['commander'],
                    changelogSourceFiles: ['source/pkg-a.js']
                },
                {
                    name: 'pkg-b',
                    changelogDependencyNames: [],
                    changelogSourceFiles: ['source/pkg-b.js']
                }
            ]
        );
        assert.strictEqual(changelog.packageMarkdownByName.get('pkg-a'), 'pkg-a:1');
        assert.strictEqual(changelog.packageMarkdownByName.get('pkg-b'), 'pkg-b:4');
        assert.strictEqual(changelog.groupedMarkdown, 'pkg-a:1\npkg-b:4');
    });

    test('plans substitution-driven generated dependency changes as dependency-only releases', async function () {
        const result = await planFor({
            packageNames: ['pkg-a'],
            buildResults: [
                buildResultFor({
                    previousReleaseArtifacts: previousReleaseArtifactsFor({
                        version: '1.0.0',
                        publishedAt: new Date('2026-05-01T00:00:00.000Z'),
                        files: [
                            {
                                filePath: 'package/package.json',
                                content: '{"name":"pkg-a","version":"1.0.0","dependencies":{"pkg-b":"1.0.0"}}',
                                isExecutable: false
                            },
                            {
                                filePath: 'package/sbom.cdx.json',
                                content: '{"components":[{"name":"pkg-b","version":"1.0.0"}]}',
                                isExecutable: false
                            },
                            { filePath: 'package/index.js', content: 'stable', isExecutable: false }
                        ]
                    })
                })
            ],
            collectContents() {
                return [
                    {
                        filePath: 'package/package.json',
                        content: '{"name":"pkg-a","version":"1.0.1","dependencies":{"pkg-b":"1.0.1"}}',
                        isExecutable: false
                    },
                    {
                        filePath: 'package/sbom.cdx.json',
                        content: '{"components":[{"name":"pkg-b","version":"1.0.1"}]}',
                        isExecutable: false
                    },
                    { filePath: 'package/index.js', content: 'stable', isExecutable: false }
                ];
            },
            bundleContents: {
                'pkg-a': [
                    analyzedBundleResource('/source/pkg-a.js', { targetFilePath: 'index.js' }),
                    analyzedBundleResource('/source/pkg-b.js', { isSubstituted: true, targetFilePath: 'pkg-b.js' })
                ]
            }
        });

        const packagePlan = expectPlan(result).packages[0];
        assert.strictEqual(packagePlan?.releaseClassification, 'dependency-only');
        assert.deepStrictEqual(packagePlan.changedArtifactFiles, ['package.json', 'sbom.cdx.json']);
        assert.deepStrictEqual(packagePlan.changelogSourceFiles, ['source/pkg-a.js', 'source/pkg-b.js']);
    });

    test('maps partial resolve failures to release-plan partial failures with empty succeeded entries', async function () {
        const plan = createPlanner({ packageNames: [] });
        const failure = new Error('resolve failed');
        const validated = validatedReleaseConfigFor(['pkg-a']);

        const partial = expectPartialFailure(
            await plan(validated, async () => {
                return Result.err<readonly ResolvedPackage[], ResolveAndLinkFailure>({
                    type: 'partial',
                    error: { succeeded: [], failures: [failure] }
                });
            })
        );

        assert.deepStrictEqual(partial.succeeded, []);
        assert.deepStrictEqual(partial.failures, [failure]);
    });
});
