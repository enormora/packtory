import assert from 'node:assert';
import { setTimeout as waitForMilliseconds } from 'node:timers/promises';
import { createPrLogEngine, defaultPrLogConfig } from '@pr-log/core';
import { suite, test } from 'mocha';
import { generateChangelogOutputs } from '../../source/packtory/packtory-changelog.ts';
import type { ReleasePlanPackage } from '../../source/packtory/packtory.ts';
import { createChangelogGitRepository } from './changelog-git-repository.ts';
import type {
    DeterministicGitHubApiScenario,
    DeterministicGitHubRestRoute
} from './deterministic-github-api-scenarios.ts';
import {
    type DeterministicGitHubApiServerContext,
    withDeterministicGitHubApiServer
} from './with-deterministic-github-api-server.ts';

async function withGitHubRequestDeadline<T>(
    githubApi: DeterministicGitHubApiServerContext,
    promise: Promise<T>
): Promise<T> {
    async function rejectAfterDeadline(): Promise<never> {
        await waitForMilliseconds(5000);
        throw new Error(`Timed out waiting for GitHub API calls: ${JSON.stringify(githubApi.requests())}`);
    }

    return Promise.race([
        promise,
        rejectAfterDeadline()
    ]);
}

type PackagePlanInput = {
    readonly changelogDependencyNames: readonly string[];
    readonly changelogDependencyUpdates: ReleasePlanPackage['changelogDependencyUpdates'];
    readonly changelogSourceFiles: readonly string[];
    readonly releaseClassification: ReleasePlanPackage['releaseClassification'];
};
type ChangelogScenarioInput = {
    readonly includeReadmeContentChange: boolean;
    readonly includeReadmeMove: boolean;
};
type ChangedFileResponse = {
    readonly additions: number;
    readonly changes: number;
    readonly deletions: number;
    readonly filename: string;
    readonly previous_filename?: string | undefined;
    readonly status: string;
};

function packagePlan(input: PackagePlanInput): ReleasePlanPackage {
    return {
        name: 'pkg-a',
        previousVersion: '1.0.0',
        nextVersion: '1.0.1',
        artifactState: 'changed',
        releaseClassification: input.releaseClassification,
        changed: true,
        previousGitHead: undefined,
        currentGitHead: 'head',
        latestRegistryMetadata: undefined,
        artifactFiles: [ 'package.json', 'README.md' ],
        changedArtifactFiles: [ 'package.json' ],
        sourceFiles: [ 'source/packages/pkg-a/README.md' ],
        changelogDependencyNames: input.changelogDependencyNames,
        changelogDependencyUpdates: input.changelogDependencyUpdates,
        changelogSourceFiles: input.changelogSourceFiles
    };
}

function dependencyOnlyPackagePlan(): ReleasePlanPackage {
    return packagePlan({
        changelogDependencyNames: [ 'react' ],
        changelogDependencyUpdates: [ { name: 'react', version: '^19.0.0' } ],
        changelogSourceFiles: [],
        releaseClassification: 'dependency-only'
    });
}

function contentChangePackagePlan(): ReleasePlanPackage {
    return packagePlan({
        changelogDependencyNames: [],
        changelogDependencyUpdates: [],
        changelogSourceFiles: [ 'source/packages/pkg-a/README.md' ],
        releaseClassification: 'substantive'
    });
}

function pureMovePackagePlan(): ReleasePlanPackage {
    return packagePlan({
        changelogDependencyNames: [],
        changelogDependencyUpdates: [],
        changelogSourceFiles: [],
        releaseClassification: 'dependency-only'
    });
}

function rulePackagePlan(changelogSourceFiles: readonly string[]): ReleasePlanPackage {
    return {
        ...packagePlan({
            changelogDependencyNames: [],
            changelogDependencyUpdates: [],
            changelogSourceFiles,
            releaseClassification: 'substantive'
        }),
        sourceFiles: [ 'source/rules/current-rule.ts' ],
        changedArtifactFiles: [ 'rules/current-rule.js' ]
    };
}

function changedFilesRoute(
    pullRequestNumber: number,
    files: readonly ChangedFileResponse[]
): DeterministicGitHubRestRoute {
    return {
        method: 'GET',
        path: `/repos/owner/repo/pulls/${pullRequestNumber}/files`,
        search: '',
        response: {
            status: 200,
            body: files
        }
    };
}

function labelRoute(pullRequestNumber: number, label: string): DeterministicGitHubRestRoute {
    return {
        method: 'GET',
        path: `/repos/owner/repo/issues/${pullRequestNumber}/labels`,
        search: '',
        response: {
            status: 200,
            body: [ { name: label } ]
        }
    };
}

function changelogScenario(input: ChangelogScenarioInput): DeterministicGitHubApiScenario {
    return {
        restRoutes: [
            {
                method: 'GET',
                path: '/repos/owner/repo/pulls/1/files',
                search: '',
                response: {
                    status: 200,
                    body: [
                        {
                            filename: 'package-lock.json',
                            status: 'modified',
                            additions: 1,
                            deletions: 1,
                            changes: 2
                        }
                    ]
                }
            },
            {
                method: 'GET',
                path: '/repos/owner/repo/pulls/2/files',
                search: '',
                response: {
                    status: 200,
                    body: input.includeReadmeMove
                        ? [
                            {
                                filename: 'source/packages/pkg-a/README.md',
                                previous_filename: 'packages/pkg-a/README.md',
                                status: 'renamed',
                                additions: 0,
                                deletions: 0,
                                changes: 0
                            }
                        ]
                        : []
                }
            },
            {
                method: 'GET',
                path: '/repos/owner/repo/issues/1/labels',
                search: '',
                response: {
                    status: 200,
                    body: [ { name: 'bug' } ]
                }
            },
            {
                method: 'GET',
                path: '/repos/owner/repo/issues/2/labels',
                search: '',
                response: {
                    status: 200,
                    body: [ { name: 'maintenance' } ]
                }
            },
            {
                method: 'GET',
                path: '/repos/owner/repo/pulls/3/files',
                search: '',
                response: {
                    status: 200,
                    body: input.includeReadmeContentChange
                        ? [
                            {
                                filename: 'source/packages/pkg-a/README.md',
                                status: 'modified',
                                additions: 1,
                                deletions: 1,
                                changes: 2
                            }
                        ]
                        : []
                }
            },
            {
                method: 'GET',
                path: '/repos/owner/repo/issues/3/labels',
                search: '',
                response: {
                    status: 200,
                    body: [ { name: 'feature' } ]
                }
            },
            changedFilesRoute(4, []),
            changedFilesRoute(5, []),
            changedFilesRoute(6, []),
            changedFilesRoute(7, []),
            changedFilesRoute(8, []),
            labelRoute(4, 'feature'),
            labelRoute(5, 'breaking'),
            labelRoute(6, 'bug'),
            labelRoute(7, 'breaking'),
            labelRoute(8, 'breaking')
        ],
        graphqlRoutes: []
    };
}

function historicalRuleScenario(): DeterministicGitHubApiScenario {
    return {
        restRoutes: [
            changedFilesRoute(1, []),
            changedFilesRoute(2, []),
            changedFilesRoute(3, []),
            changedFilesRoute(4, [
                {
                    filename: 'source/rules/old-rule.ts',
                    status: 'modified',
                    additions: 1,
                    deletions: 1,
                    changes: 2
                }
            ]),
            changedFilesRoute(5, [
                {
                    filename: 'source/rules/current-rule.ts',
                    previous_filename: 'source/rules/old-rule.ts',
                    status: 'renamed',
                    additions: 1,
                    deletions: 1,
                    changes: 2
                }
            ]),
            changedFilesRoute(6, [
                {
                    filename: 'source/rules/subsumed-rule.ts',
                    status: 'modified',
                    additions: 1,
                    deletions: 1,
                    changes: 2
                }
            ]),
            changedFilesRoute(7, [
                {
                    filename: 'source/rules/current-rule.ts',
                    status: 'modified',
                    additions: 1,
                    deletions: 1,
                    changes: 2
                },
                {
                    filename: 'source/rules/subsumed-rule.ts',
                    status: 'removed',
                    additions: 0,
                    deletions: 20,
                    changes: 20
                }
            ]),
            changedFilesRoute(8, [
                {
                    filename: 'source/rules/removed-rule.ts',
                    status: 'removed',
                    additions: 0,
                    deletions: 20,
                    changes: 20
                }
            ]),
            labelRoute(1, 'bug'),
            labelRoute(2, 'maintenance'),
            labelRoute(3, 'feature'),
            labelRoute(4, 'feature'),
            labelRoute(5, 'breaking'),
            labelRoute(6, 'bug'),
            labelRoute(7, 'breaking'),
            labelRoute(8, 'breaking')
        ],
        graphqlRoutes: []
    };
}

async function generateChangelog(
    githubApi: DeterministicGitHubApiServerContext,
    packages: readonly ReleasePlanPackage[],
    changelogSourceFileRootsByPackageName: ReadonlyMap<string, readonly string[]>
): ReturnType<typeof generateChangelogOutputs> {
    const repositoryPath = await createChangelogGitRepository();
    const engine = createPrLogEngine({
        config: defaultPrLogConfig,
        githubApiBaseUrl: githubApi.baseUrl,
        githubToken: undefined,
        workingDirectory: repositoryPath
    });

    return withGitHubRequestDeadline(
        githubApi,
        generateChangelogOutputs({
            currentDate: new Date('2026-07-13T00:00:00.000Z'),
            changelogSourceFileRootsByPackageName,
            explicitBaseRef: undefined,
            githubRepo: 'owner/repo',
            ignoredAttributionPaths: [],
            packages,
            packageTagFormat: undefined,
            prLogConfig: defaultPrLogConfig,
            prLogEngine: engine,
            targetScopedLabelPattern: undefined
        })
    );
}

suite('changelog GitHub API integration', function () {
    test(
        'keeps dependency-only changelogs focused on manifest dependency pull requests',
        withDeterministicGitHubApiServer(
            changelogScenario({ includeReadmeContentChange: false, includeReadmeMove: true }),
            async function (githubApi) {
                const changelog = await generateChangelog(githubApi, [ dependencyOnlyPackagePlan() ], new Map());

                assert.match(changelog.groupedMarkdown, /Update react to \^19\.0\.0/u);
                assert.match(changelog.groupedMarkdown, /\/owner\/repo\/pull\/1/u);
                assert.doesNotMatch(changelog.groupedMarkdown, /Move package README/u);
            }
        )
    );

    test(
        'keeps regular source content changes attributed to their pull request',
        withDeterministicGitHubApiServer(
            changelogScenario({ includeReadmeContentChange: true, includeReadmeMove: false }),
            async function (githubApi) {
                const changelog = await generateChangelog(githubApi, [ contentChangePackagePlan() ], new Map());

                assert.match(changelog.groupedMarkdown, /Update package README content/u);
                assert.match(changelog.groupedMarkdown, /\/owner\/repo\/pull\/3/u);
            }
        )
    );

    test(
        'keeps source-only path moves without emitted package changes out of dependency-only changelogs',
        withDeterministicGitHubApiServer(
            changelogScenario({ includeReadmeContentChange: false, includeReadmeMove: true }),
            async function (githubApi) {
                const changelog = await generateChangelog(githubApi, [ pureMovePackagePlan() ], new Map());

                assert.partialDeepStrictEqual(changelog, {
                    groupedMarkdown: '',
                    packageNamesWithoutChangelogEntries: [ 'pkg-a' ]
                });
            }
        )
    );

    test(
        'attributes pull requests that changed a source file before it was renamed in the release range',
        withDeterministicGitHubApiServer(
            historicalRuleScenario(),
            async function (githubApi) {
                const changelog = await generateChangelog(
                    githubApi,
                    [ rulePackagePlan([ 'source/rules/current-rule.ts' ]) ],
                    new Map([ [ 'pkg-a', [ 'source/rules' ] ] ])
                );

                assert.match(changelog.groupedMarkdown, /Update old rule behavior/u);
                assert.match(changelog.groupedMarkdown, /Rename old rule/u);
            }
        )
    );

    test(
        'attributes pull requests that changed a source file before it was deleted by a subsuming change',
        withDeterministicGitHubApiServer(
            historicalRuleScenario(),
            async function (githubApi) {
                const changelog = await generateChangelog(
                    githubApi,
                    [ rulePackagePlan([ 'source/rules/current-rule.ts' ]) ],
                    new Map([ [ 'pkg-a', [ 'source/rules' ] ] ])
                );

                assert.match(changelog.groupedMarkdown, /Fix subsumed rule behavior/u);
                assert.match(changelog.groupedMarkdown, /Subsume old rule into new rule/u);
            }
        )
    );

    test(
        'attributes pure deleted source files from substantive releases to the package source root',
        withDeterministicGitHubApiServer(
            historicalRuleScenario(),
            async function (githubApi) {
                const changelog = await generateChangelog(
                    githubApi,
                    [ rulePackagePlan([]) ],
                    new Map([ [ 'pkg-a', [ 'source/rules' ] ] ])
                );

                assert.match(changelog.groupedMarkdown, /Remove legacy rules/u);
            }
        )
    );
});
