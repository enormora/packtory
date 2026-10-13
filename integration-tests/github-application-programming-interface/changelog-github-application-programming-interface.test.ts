import assert from 'node:assert';
import { setTimeout as waitForMilliseconds } from 'node:timers/promises';
import {
    defaultPrLogConfig as defaultPullRequestLogConfiguration,
    createPrLogEngine as createLibraryEngine
} from '@pr-log/core';
import { suite, test } from 'mocha';
import { createPullRequestLogEngineFactory } from '../../source/changelog/pull-request-log.ts';
import { generateChangelogOutputs } from '../../source/packtory/packtory-changelog.ts';
import type { ReleasePlanPackage } from '../../source/packtory/packtory.ts';
import { createChangelogGitRepository } from './changelog-git-repository.ts';
import type {
    DeterministicGitHubApplicationProgrammingInterfaceScenario,
    DeterministicGitHubRequestRoute
} from './deterministic-github-application-programming-interface-scenarios.ts';
import {
    type DeterministicGitHubApplicationProgrammingInterfaceServerContext,
    withDeterministicGitHubApplicationProgrammingInterfaceServer
} from './with-deterministic-github-application-programming-interface-server.ts';

const createPullRequestLogEngine = createPullRequestLogEngineFactory(createLibraryEngine);

async function withGitHubRequestDeadline<T>(
    githubApplicationProgrammingInterface: DeterministicGitHubApplicationProgrammingInterfaceServerContext,
    promise: Promise<T>
): Promise<T> {
    async function rejectAfterDeadline(): Promise<never> {
        await waitForMilliseconds(5000);
        throw new Error(
            `Timed out waiting for GitHub API calls: ${
                JSON.stringify(githubApplicationProgrammingInterface.requests())
            }`
        );
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
        name: 'package-a',
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
        sourceFiles: [ 'source/packages/package-a/README.md' ],
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
        changelogSourceFiles: [ 'source/packages/package-a/README.md' ],
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
): DeterministicGitHubRequestRoute {
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

function labelRoute(pullRequestNumber: number, label: string): DeterministicGitHubRequestRoute {
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

function changelogScenario(input: ChangelogScenarioInput): DeterministicGitHubApplicationProgrammingInterfaceScenario {
    return {
        requestRoutes: [
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
                                filename: 'source/packages/package-a/README.md',
                                previous_filename: 'packages/package-a/README.md',
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
                                filename: 'source/packages/package-a/README.md',
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

function historicalRuleScenario(): DeterministicGitHubApplicationProgrammingInterfaceScenario {
    return {
        requestRoutes: [
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
    githubApplicationProgrammingInterface: DeterministicGitHubApplicationProgrammingInterfaceServerContext,
    packages: readonly ReleasePlanPackage[],
    changelogSourceFileRootsByPackageName: ReadonlyMap<string, readonly string[]>
): ReturnType<typeof generateChangelogOutputs> {
    const repositoryPath = await createChangelogGitRepository();
    const engine = createPullRequestLogEngine({
        configuration: defaultPullRequestLogConfiguration,
        githubApplicationProgrammingInterfaceBaseAddress: githubApplicationProgrammingInterface.baseAddress,
        githubToken: undefined,
        workingDirectory: repositoryPath
    });

    return withGitHubRequestDeadline(
        githubApplicationProgrammingInterface,
        generateChangelogOutputs({
            currentDate: new Date('2026-07-13T00:00:00.000Z'),
            changelogSourceFileRootsByPackageName,
            explicitBaseReference: undefined,
            githubRepository: 'owner/repo',
            ignoredAttributionPaths: [],
            packages,
            packageTagFormat: undefined,
            pullRequestLogConfiguration: defaultPullRequestLogConfiguration,
            pullRequestLogEngine: engine,
            targetScopedLabelPattern: undefined
        })
    );
}

suite('changelog GitHub API integration', function () {
    test(
        'keeps dependency-only changelogs focused on manifest dependency pull requests',
        withDeterministicGitHubApplicationProgrammingInterfaceServer(
            changelogScenario({ includeReadmeContentChange: false, includeReadmeMove: true }),
            async function (githubApplicationProgrammingInterface) {
                const changelog = await generateChangelog(githubApplicationProgrammingInterface, [
                    dependencyOnlyPackagePlan()
                ], new Map());

                assert.match(changelog.groupedMarkdown, /Update react to \^19\.0\.0/u);
                assert.match(changelog.groupedMarkdown, /\/owner\/repo\/pull\/1/u);
                assert.doesNotMatch(changelog.groupedMarkdown, /Move package README/u);
            }
        )
    );

    test(
        'keeps regular source content changes attributed to their pull request',
        withDeterministicGitHubApplicationProgrammingInterfaceServer(
            changelogScenario({ includeReadmeContentChange: true, includeReadmeMove: false }),
            async function (githubApplicationProgrammingInterface) {
                const changelog = await generateChangelog(githubApplicationProgrammingInterface, [
                    contentChangePackagePlan()
                ], new Map());

                assert.match(changelog.groupedMarkdown, /Update package README content/u);
                assert.match(changelog.groupedMarkdown, /\/owner\/repo\/pull\/3/u);
            }
        )
    );

    test(
        'keeps source-only path moves without emitted package changes out of dependency-only changelogs',
        withDeterministicGitHubApplicationProgrammingInterfaceServer(
            changelogScenario({ includeReadmeContentChange: false, includeReadmeMove: true }),
            async function (githubApplicationProgrammingInterface) {
                const changelog = await generateChangelog(githubApplicationProgrammingInterface, [
                    pureMovePackagePlan()
                ], new Map());

                assert.partialDeepStrictEqual(changelog, {
                    groupedMarkdown: '',
                    packageNamesWithoutChangelogEntries: [ 'package-a' ]
                });
            }
        )
    );

    test(
        'attributes pull requests that changed a source file before it was renamed in the release range',
        withDeterministicGitHubApplicationProgrammingInterfaceServer(
            historicalRuleScenario(),
            async function (githubApplicationProgrammingInterface) {
                const changelog = await generateChangelog(
                    githubApplicationProgrammingInterface,
                    [ rulePackagePlan([ 'source/rules/current-rule.ts' ]) ],
                    new Map([ [ 'package-a', [ 'source/rules' ] ] ])
                );

                assert.match(changelog.groupedMarkdown, /Update old rule behavior/u);
                assert.match(changelog.groupedMarkdown, /Rename old rule/u);
            }
        )
    );

    test(
        'attributes pull requests that changed a source file before it was deleted by a subsuming change',
        withDeterministicGitHubApplicationProgrammingInterfaceServer(
            historicalRuleScenario(),
            async function (githubApplicationProgrammingInterface) {
                const changelog = await generateChangelog(
                    githubApplicationProgrammingInterface,
                    [ rulePackagePlan([ 'source/rules/current-rule.ts' ]) ],
                    new Map([ [ 'package-a', [ 'source/rules' ] ] ])
                );

                assert.match(changelog.groupedMarkdown, /Fix subsumed rule behavior/u);
                assert.match(changelog.groupedMarkdown, /Subsume old rule into new rule/u);
            }
        )
    );

    test(
        'attributes deleted historical repository sources when package source roots point at generated output',
        withDeterministicGitHubApplicationProgrammingInterfaceServer(
            historicalRuleScenario(),
            async function (githubApplicationProgrammingInterface) {
                const changelog = await generateChangelog(
                    githubApplicationProgrammingInterface,
                    [ rulePackagePlan([ 'source/rules/current-rule.ts' ]) ],
                    new Map([ [ 'package-a', [ 'target/build/source' ] ] ])
                );

                assert.match(changelog.groupedMarkdown, /Fix subsumed rule behavior/u);
                assert.match(changelog.groupedMarkdown, /Subsume old rule into new rule/u);
            }
        )
    );

    test(
        'attributes pure deleted source files from substantive releases to the package source root',
        withDeterministicGitHubApplicationProgrammingInterfaceServer(
            historicalRuleScenario(),
            async function (githubApplicationProgrammingInterface) {
                const changelog = await generateChangelog(
                    githubApplicationProgrammingInterface,
                    [ rulePackagePlan([]) ],
                    new Map([ [ 'package-a', [ 'source/rules' ] ] ])
                );

                assert.match(changelog.groupedMarkdown, /Remove legacy rules/u);
            }
        )
    );
});
