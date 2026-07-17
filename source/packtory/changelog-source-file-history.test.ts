import assert from 'node:assert';
import { suite, test } from 'mocha';
import { pullRequestChangedFileFactory, type PullRequestChangedFileShape } from '../test-libraries/pr-log-fixtures.ts';
import { expandChangelogSourceFilesForHistory } from './changelog-source-file-history.ts';
import type { ReleasePlanPackage } from './packtory-results.ts';

function packagePlan(
    changelogSourceFiles: readonly string[],
    releaseClassification: ReleasePlanPackage['releaseClassification'] = 'substantive'
): ReleasePlanPackage {
    return {
        name: 'pkg-a',
        previousVersion: '1.0.0',
        nextVersion: '1.0.1',
        artifactState: 'changed',
        releaseClassification,
        changed: true,
        previousGitHead: undefined,
        currentGitHead: 'head',
        latestRegistryMetadata: undefined,
        artifactFiles: [],
        changedArtifactFiles: [],
        sourceFiles: [],
        changelogDependencyNames: [],
        changelogDependencyUpdates: [],
        changelogSourceFiles
    };
}

function changedFilesByPullRequest(
    entries: readonly (readonly [number, PullRequestChangedFileShape])[]
): ReadonlyMap<number, readonly PullRequestChangedFileShape[]> {
    const filesByPullRequest = new Map<number, PullRequestChangedFileShape[]>();
    for (const [ pullRequestNumber, file ] of entries) {
        filesByPullRequest.set(pullRequestNumber, [ ...filesByPullRequest.get(pullRequestNumber) ?? [], file ]);
    }
    return filesByPullRequest;
}

function expand(
    plan: ReleasePlanPackage,
    filesByPullRequest: ReadonlyMap<number, readonly PullRequestChangedFileShape[]>,
    sourceFileRoots: readonly string[] = [ 'source/rules' ]
): readonly string[] {
    return expandChangelogSourceFilesForHistory({
        packagePlan: plan,
        changedFilesByPullRequest: filesByPullRequest,
        sourceFileRoots
    });
}

function registerRenameTests(): void {
    test('follows rename chains from the current source file to earlier source names', function () {
        const result = expand(
            packagePlan([ 'source/rules/current-rule.ts' ]),
            changedFilesByPullRequest([
                [
                    2,
                    pullRequestChangedFileFactory.build({
                        path: 'source/rules/current-rule.ts',
                        previousPath: 'source/rules/middle-rule.ts',
                        status: 'renamed'
                    })
                ],
                [
                    1,
                    pullRequestChangedFileFactory.build({
                        path: 'source/rules/middle-rule.ts',
                        previousPath: 'source/rules/old-rule.ts',
                        status: 'renamed'
                    })
                ]
            ])
        );

        assert.deepStrictEqual(result, [
            'source/rules/current-rule.ts',
            'source/rules/middle-rule.ts',
            'source/rules/old-rule.ts'
        ]);
    });

    test('follows rename chains from a selected previous source file to its newer name', function () {
        const result = expand(
            packagePlan([ 'source/rules/old-rule.ts' ]),
            changedFilesByPullRequest([
                [
                    1,
                    pullRequestChangedFileFactory.build({
                        path: 'source/rules/current-rule.ts',
                        previousPath: 'source/rules/old-rule.ts',
                        status: 'renamed'
                    })
                ]
            ])
        );

        assert.deepStrictEqual(result, [ 'source/rules/old-rule.ts', 'source/rules/current-rule.ts' ]);
    });

    test('does not add unrelated renamed files', function () {
        const result = expand(
            packagePlan([ 'source/rules/current-rule.ts' ]),
            changedFilesByPullRequest([
                [
                    1,
                    pullRequestChangedFileFactory.build({
                        path: 'source/rules/unrelated-rule.ts',
                        previousPath: 'source/rules/unrelated-old-rule.ts',
                        status: 'renamed'
                    })
                ]
            ])
        );

        assert.deepStrictEqual(result, [ 'source/rules/current-rule.ts' ]);
    });
}

function registerTargetAttachedDeleteTests(): void {
    test('adds deleted package source files from pull requests that also touch selected source files', function () {
        const result = expand(
            packagePlan([ 'source/rules/current-rule.ts' ], 'dependency-only'),
            changedFilesByPullRequest([
                [
                    1,
                    pullRequestChangedFileFactory.build({
                        path: 'source/other/unrelated.ts',
                        status: 'modified'
                    })
                ],
                [
                    1,
                    pullRequestChangedFileFactory.build({
                        path: 'source/rules/current-rule.ts',
                        status: 'modified'
                    })
                ],
                [
                    1,
                    pullRequestChangedFileFactory.build({
                        path: 'source/rules/subsumed-rule.ts',
                        status: 'deleted'
                    })
                ]
            ])
        );

        assert.deepStrictEqual(result, [ 'source/rules/current-rule.ts', 'source/rules/subsumed-rule.ts' ]);
    });

    test('does not add deleted files from pull requests that do not touch selected source files', function () {
        const result = expand(
            packagePlan([ 'source/rules/current-rule.ts' ], 'dependency-only'),
            changedFilesByPullRequest([
                [
                    1,
                    pullRequestChangedFileFactory.build({
                        path: 'source/rules/unrelated-rule.ts',
                        status: 'modified'
                    })
                ],
                [
                    1,
                    pullRequestChangedFileFactory.build({
                        path: 'source/rules/subsumed-rule.ts',
                        status: 'deleted'
                    })
                ]
            ])
        );

        assert.deepStrictEqual(result, [ 'source/rules/current-rule.ts' ]);
    });

    test('does not add target-attached deleted files outside the package source roots', function () {
        const result = expand(
            packagePlan([ 'source/rules/current-rule.ts' ], 'dependency-only'),
            changedFilesByPullRequest([
                [
                    1,
                    pullRequestChangedFileFactory.build({
                        path: 'source/rules/current-rule.ts',
                        status: 'modified'
                    })
                ],
                [
                    1,
                    pullRequestChangedFileFactory.build({
                        path: 'source/other/subsumed-rule.ts',
                        status: 'deleted'
                    })
                ]
            ])
        );

        assert.deepStrictEqual(result, [ 'source/rules/current-rule.ts' ]);
    });
}

function registerPureDeleteTests(): void {
    test('adds pure deleted package source files for substantive releases', function () {
        const result = expand(
            packagePlan([]),
            changedFilesByPullRequest([
                [
                    1,
                    pullRequestChangedFileFactory.build({
                        path: 'source/rules/removed-rule.ts',
                        status: 'removed'
                    })
                ]
            ])
        );

        assert.deepStrictEqual(result, [ 'source/rules/removed-rule.ts' ]);
    });

    test('does not add pure deleted source files for dependency-only releases', function () {
        const result = expand(
            packagePlan([], 'dependency-only'),
            changedFilesByPullRequest([
                [
                    1,
                    pullRequestChangedFileFactory.build({
                        path: 'source/rules/removed-rule.ts',
                        status: 'removed'
                    })
                ]
            ])
        );

        assert.deepStrictEqual(result, []);
    });

    test('does not add modified source files as pure deletes', function () {
        const result = expand(
            packagePlan([]),
            changedFilesByPullRequest([
                [
                    1,
                    pullRequestChangedFileFactory.build({
                        path: 'source/rules/modified-rule.ts',
                        status: 'modified'
                    })
                ]
            ])
        );

        assert.deepStrictEqual(result, []);
    });

    test('does not add deleted files outside the package source roots', function () {
        const result = expand(
            packagePlan([]),
            changedFilesByPullRequest([
                [
                    1,
                    pullRequestChangedFileFactory.build({
                        path: 'source/rules-old/removed-rule.ts',
                        status: 'removed'
                    })
                ]
            ])
        );

        assert.deepStrictEqual(result, []);
    });

    test('matches pure deleted source files against every configured source root', function () {
        const result = expand(
            packagePlan([]),
            changedFilesByPullRequest([
                [
                    1,
                    pullRequestChangedFileFactory.build({
                        path: 'packages/pkg-a/rules/removed-rule.ts',
                        status: 'removed'
                    })
                ]
            ]),
            [ 'source/rules', 'packages/pkg-a/rules' ]
        );

        assert.deepStrictEqual(result, [ 'packages/pkg-a/rules/removed-rule.ts' ]);
    });

    test('matches pure deleted source files when the package source root is the repository root', function () {
        const result = expand(
            packagePlan([]),
            changedFilesByPullRequest([
                [
                    1,
                    pullRequestChangedFileFactory.build({
                        path: 'removed-rule.ts',
                        status: 'removed'
                    })
                ]
            ]),
            [ '' ]
        );

        assert.deepStrictEqual(result, [ 'removed-rule.ts' ]);
    });

    test('normalizes absolute changed file paths before matching', function () {
        const result = expand(
            packagePlan([]),
            changedFilesByPullRequest([
                [
                    1,
                    pullRequestChangedFileFactory.build({
                        path: '///source/rules/removed-rule.ts',
                        status: 'removed'
                    })
                ]
            ])
        );

        assert.deepStrictEqual(result, [ 'source/rules/removed-rule.ts' ]);
    });
}

suite('changelog-source-file-history', function () {
    registerRenameTests();
    registerTargetAttachedDeleteTests();
    registerPureDeleteTests();
});
