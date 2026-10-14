import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake } from 'sinon';
import type { GeneratedChangelog } from '../../packtory/packtory-changelog.ts';
import { createFakeFileManager } from '../../test-libraries/fake-file-manager.ts';
import {
    collectChangelogSourceFileRoots,
    collectGeneratedAttributionPaths,
    createChangelogGenerationOptions,
    parseValidConfiguration,
    shouldPageGroupedChangelog,
    writeConfiguredChangelogs,
    type ChangelogConfiguration
} from './changelog-destinations.ts';

const dependencies = { workingDirectory: '/repo' } as const;

type GeneratedChangelogOverrides = {
    readonly packageMarkdownByName?: ReadonlyMap<string, string>;
};
type ChangelogUpdateInput = {
    readonly existingChangelogMarkdown: string;
    readonly generatedChangelogMarkdown: string;
};

function createChangelogConfiguration(
    overrides: Readonly<Partial<ChangelogConfiguration>> = {}
): ChangelogConfiguration {
    return {
        changelog: {
            outputs: [
                { kind: 'repository-file', path: 'CHANGELOG.md' },
                { kind: 'package-file', path: 'documentation/CHANGELOG.md' },
                { kind: 'github-release' }
            ]
        },
        commonPackageSettings: { sourcesFolder: 'source' },
        packages: [
            { name: 'package-a', sourcesFolder: 'source/package-a' },
            { name: 'package-b', sourcesFolder: '/external/package-b' }
        ],
        ...overrides
    };
}

function createGeneratedChangelog(overrides: GeneratedChangelogOverrides = {}): GeneratedChangelog {
    return {
        groupedMarkdown: 'grouped',
        packageNamesWithoutChangelogEntries: [],
        packageMarkdownByName: overrides.packageMarkdownByName ?? new Map([ [ 'package-a', 'package-a' ] ])
    };
}

function createPacktoryConfigurationWithPullRequestLog(pullRequestLog: unknown): unknown {
    return {
        changelog: { pullRequestLog },
        packages: [
            {
                mainPackageManifest: { type: 'module' },
                name: 'package-a',
                publishSettings: { access: 'public' },
                roots: { main: { javaScript: 'index.js' } },
                sourcesFolder: 'source'
            }
        ]
    };
}

async function assertRepositoryReadFailureRethrown(error: Error, messagePattern: RegExp): Promise<void> {
    const fileManager = createFakeFileManager({
        simulatedReadFileResponses: [ { error } ]
    });

    await assert.rejects(
        writeConfiguredChangelogs(
            { ...dependencies, fileManager },
            createChangelogConfiguration({
                changelog: { outputs: [ { kind: 'repository-file', path: 'CHANGELOG.md' } ] }
            }),
            { updateChangelog: fake.returns('updated') },
            createGeneratedChangelog()
        ),
        messagePattern
    );
}

suite('changelog-destinations', function () {
    test('parseValidConfiguration returns undefined for invalid configs', function () {
        assert.strictEqual(parseValidConfiguration({ packages: [] }), undefined);
    });

    test('parseValidConfiguration returns undefined for non-object pr-log settings', function () {
        assert.strictEqual(parseValidConfiguration(createPacktoryConfigurationWithPullRequestLog(null)), undefined);
        assert.strictEqual(
            parseValidConfiguration(createPacktoryConfigurationWithPullRequestLog('invalid')),
            undefined
        );
    });

    test('parseValidConfiguration accepts object pr-log settings', function () {
        assert.notStrictEqual(
            parseValidConfiguration(createPacktoryConfigurationWithPullRequestLog({ validLabels: { bug: 'Bugs' } })),
            undefined
        );
    });

    test('createChangelogGenerationOptions combines defaults with configured settings', function () {
        const options = createChangelogGenerationOptions(
            createChangelogConfiguration({
                changelog: {
                    explicitBaseReference: 'main',
                    pullRequestLog: { validLabels: { bug: 'Fixed Bugs', operations: 'Operations' } },
                    packageTagFormat: 'pkg/{packageName}/v{version}',
                    targetScopedLabelPattern: 'scope:{targetName}:{label}'
                }
            })
        );

        assert.partialDeepStrictEqual(options, {
            explicitBaseReference: 'main',
            packageTagFormat: 'pkg/{packageName}/v{version}',
            targetScopedLabelPattern: 'scope:{targetName}:{label}'
        });
        assert.strictEqual(options.pullRequestLogConfiguration.validLabels.get('bug'), 'Fixed Bugs');
        assert.strictEqual(options.pullRequestLogConfiguration.validLabels.get('operations'), 'Operations');
    });

    test('collectChangelogSourceFileRoots resolves package source folders relative to the repository', function () {
        assert.deepStrictEqual(
            collectChangelogSourceFileRoots(
                { workingDirectory: '/repo' },
                createChangelogConfiguration({
                    packages: [
                        { name: 'package-a', sourcesFolder: 'packages/package-a/source' },
                        { name: 'package-b', sourcesFolder: '/repo/packages/package-b/source' },
                        { name: 'package-c', sourcesFolder: '.' }
                    ]
                })
            ),
            new Map([
                [ 'package-a', [ 'packages/package-a/source' ] ],
                [ 'package-b', [ 'packages/package-b/source' ] ],
                [ 'package-c', [ '' ] ]
            ])
        );
    });

    suite('collectGeneratedAttributionPaths', function () {
        test('returns no paths when outputs are absent', function () {
            assert.deepStrictEqual(
                collectGeneratedAttributionPaths(dependencies, createChangelogConfiguration({ changelog: undefined })),
                []
            );
            assert.deepStrictEqual(
                collectGeneratedAttributionPaths(
                    dependencies,
                    createChangelogConfiguration({
                        changelog: { pullRequestLog: { validLabels: { operations: 'Operations' } } }
                    })
                ),
                []
            );
        });

        test('includes repository and in-repository package files', function () {
            assert.deepStrictEqual(collectGeneratedAttributionPaths(dependencies, createChangelogConfiguration()), [
                'CHANGELOG.md',
                'source/package-a/documentation/CHANGELOG.md'
            ]);
        });

        test('uses common sourcesFolder for package files', function () {
            assert.deepStrictEqual(
                collectGeneratedAttributionPaths(
                    dependencies,
                    createChangelogConfiguration({
                        changelog: { outputs: [ { kind: 'package-file', path: 'CHANGELOG.md' } ] },
                        packages: [ { name: 'package-a' } ]
                    })
                ),
                [ 'source/CHANGELOG.md' ]
            );
        });

        test('includes explicit package file paths', function () {
            assert.deepStrictEqual(
                collectGeneratedAttributionPaths(
                    dependencies,
                    createChangelogConfiguration({
                        changelog: {
                            outputs: [
                                {
                                    kind: 'package-file',
                                    paths: {
                                        'package-a': 'packages/package-a/CHANGELOG.md',
                                        'package-b': 'packages/package-b/CHANGELOG.md'
                                    }
                                }
                            ]
                        },
                        commonPackageSettings: undefined,
                        packages: [ { name: 'package-a' }, { name: 'package-b' } ]
                    })
                ),
                [ 'packages/package-a/CHANGELOG.md', 'packages/package-b/CHANGELOG.md' ]
            );
        });

        test('ignores github-release outputs', function () {
            assert.deepStrictEqual(
                collectGeneratedAttributionPaths(
                    dependencies,
                    createChangelogConfiguration({ changelog: { outputs: [ { kind: 'github-release' } ] } })
                ),
                []
            );
        });

        test('reports package-file outputs without sourcesFolder', function () {
            assert.throws(function () {
                collectGeneratedAttributionPaths(
                    dependencies,
                    createChangelogConfiguration({
                        changelog: { outputs: [ { kind: 'package-file', path: 'CHANGELOG.md' } ] },
                        commonPackageSettings: undefined,
                        packages: [ { name: 'package-a' } ]
                    })
                );
            }, /Config for package "package-a" is missing the sources folder/u);
        });
    });

    test('shouldPageGroupedChangelog follows default and github-release output behavior', function () {
        assert.strictEqual(shouldPageGroupedChangelog(undefined), true);
        assert.strictEqual(shouldPageGroupedChangelog([ { kind: 'repository-file', path: 'CHANGELOG.md' } ]), false);
        assert.strictEqual(shouldPageGroupedChangelog([ { kind: 'github-release' } ]), true);
        assert.strictEqual(
            shouldPageGroupedChangelog([
                { kind: 'repository-file', path: 'CHANGELOG.md' },
                { kind: 'github-release' }
            ]),
            true
        );
    });

    suite('writeConfiguredChangelogs repository outputs', function () {
        test('does nothing when outputs are absent', async function () {
            const fileManager = createFakeFileManager();

            const writtenPaths = await writeConfiguredChangelogs(
                { ...dependencies, fileManager },
                createChangelogConfiguration({ changelog: undefined }),
                { updateChangelog: fake.returns('updated') },
                createGeneratedChangelog()
            );

            assert.deepStrictEqual(writtenPaths, []);
            assert.strictEqual(fileManager.getWriteFileCallCount(), 0);
        });

        test('does nothing when outputs are omitted from changelog config', async function () {
            const fileManager = createFakeFileManager();

            const writtenPaths = await writeConfiguredChangelogs(
                { ...dependencies, fileManager },
                createChangelogConfiguration({
                    changelog: { pullRequestLog: { validLabels: { operations: 'Operations' } } }
                }),
                { updateChangelog: fake.returns('updated') },
                createGeneratedChangelog()
            );

            assert.deepStrictEqual(writtenPaths, []);
            assert.strictEqual(fileManager.getWriteFileCallCount(), 0);
        });

        test('passes empty existing markdown for missing files', async function () {
            const missingFileError = Object.assign(new Error('missing'), { code: 'ENOENT' });
            const fileManager = createFakeFileManager({
                simulatedReadFileResponses: [ { error: missingFileError } ]
            });
            const updateChangelog = fake(
                function (input: ChangelogUpdateInput) {
                    assert.strictEqual(input.existingChangelogMarkdown, '');
                    return input.generatedChangelogMarkdown;
                }
            );

            const writtenPaths = await writeConfiguredChangelogs(
                { ...dependencies, fileManager },
                createChangelogConfiguration({
                    changelog: { outputs: [ { kind: 'repository-file', path: 'CHANGELOG.md' } ] }
                }),
                { updateChangelog },
                createGeneratedChangelog()
            );

            assert.deepStrictEqual(writtenPaths, [ '/repo/CHANGELOG.md' ]);
            assert.strictEqual(updateChangelog.callCount, 1);
        });

        test('skips empty generated markdown', async function () {
            const fileManager = createFakeFileManager();

            const writtenPaths = await writeConfiguredChangelogs(
                { ...dependencies, fileManager },
                createChangelogConfiguration({
                    changelog: { outputs: [ { kind: 'repository-file', path: 'CHANGELOG.md' } ] }
                }),
                { updateChangelog: fake.returns('updated') },
                { groupedMarkdown: '', packageNamesWithoutChangelogEntries: [], packageMarkdownByName: new Map() }
            );

            assert.deepStrictEqual(writtenPaths, []);
            assert.strictEqual(fileManager.getReadFileCallCount(), 0);
            assert.strictEqual(fileManager.getWriteFileCallCount(), 0);
        });
    });

    suite('writeConfiguredChangelogs package outputs', function () {
        test('reports package markdown without config', async function () {
            const fileManager = createFakeFileManager();

            await assert.rejects(
                writeConfiguredChangelogs(
                    { ...dependencies, fileManager },
                    createChangelogConfiguration({
                        changelog: { outputs: [ { kind: 'package-file', path: 'CHANGELOG.md' } ] }
                    }),
                    { updateChangelog: fake.returns('updated') },
                    createGeneratedChangelog({ packageMarkdownByName: new Map([ [ 'missing', 'markdown' ] ]) })
                ),
                /Config for package "missing" is missing/u
            );
        });

        test('reports package-file outputs without sourcesFolder', async function () {
            const fileManager = createFakeFileManager();

            await assert.rejects(
                writeConfiguredChangelogs(
                    { ...dependencies, fileManager },
                    createChangelogConfiguration({
                        changelog: { outputs: [ { kind: 'package-file', path: 'CHANGELOG.md' } ] },
                        commonPackageSettings: undefined,
                        packages: [ { name: 'package-a' } ]
                    }),
                    { updateChangelog: fake.returns('updated') },
                    createGeneratedChangelog({ packageMarkdownByName: new Map([ [ 'package-a', 'markdown' ] ]) })
                ),
                /Config for package "package-a" is missing the sources folder/u
            );
        });

        test('uses common sourcesFolder for package-file outputs', async function () {
            const fileManager = createFakeFileManager();

            const writtenPaths = await writeConfiguredChangelogs(
                { ...dependencies, fileManager },
                createChangelogConfiguration({
                    changelog: { outputs: [ { kind: 'package-file', path: 'CHANGELOG.md' } ] },
                    packages: [ { name: 'package-a' } ]
                }),
                { updateChangelog: fake.returns('updated') },
                createGeneratedChangelog({ packageMarkdownByName: new Map([ [ 'package-a', 'markdown' ] ]) })
            );

            assert.deepStrictEqual(writtenPaths, [ '/repo/source/CHANGELOG.md' ]);
        });

        test('writes explicit package-file changelog outputs', async function () {
            const fileManager = createFakeFileManager();

            const writtenPaths = await writeConfiguredChangelogs(
                { ...dependencies, fileManager },
                createChangelogConfiguration({
                    changelog: {
                        outputs: [
                            {
                                kind: 'package-file',
                                paths: {
                                    'package-a': 'packages/package-a/CHANGELOG.md',
                                    'package-b': 'packages/package-b/CHANGELOG.md'
                                }
                            }
                        ]
                    }
                }),
                {
                    updateChangelog: fake(
                        function (input: ChangelogUpdateInput) {
                            return input.generatedChangelogMarkdown;
                        }
                    )
                },
                createGeneratedChangelog({
                    packageMarkdownByName: new Map([
                        [ 'package-a', 'package-a' ],
                        [ 'package-b', 'package-b' ]
                    ])
                })
            );

            assert.deepStrictEqual(writtenPaths, [
                '/repo/packages/package-a/CHANGELOG.md',
                '/repo/packages/package-b/CHANGELOG.md'
            ]);
            assert.deepStrictEqual(fileManager.getAllWriteFileCalls(), [
                { filePath: '/repo/packages/package-a/CHANGELOG.md', content: 'package-a' },
                { filePath: '/repo/packages/package-b/CHANGELOG.md', content: 'package-b' }
            ]);
        });

        test('reports package markdown without an explicit path', async function () {
            const fileManager = createFakeFileManager();

            await assert.rejects(
                writeConfiguredChangelogs(
                    { ...dependencies, fileManager },
                    createChangelogConfiguration({
                        changelog: {
                            outputs: [
                                {
                                    kind: 'package-file',
                                    paths: { 'package-a': 'packages/package-a/CHANGELOG.md' }
                                }
                            ]
                        }
                    }),
                    { updateChangelog: fake.returns('updated') },
                    createGeneratedChangelog({
                        packageMarkdownByName: new Map([
                            [ 'package-a', 'package-a' ],
                            [ 'package-b', 'package-b' ]
                        ])
                    })
                ),
                /Changelog output path for package "package-b" is missing/u
            );
        });

        test('rethrows non-missing read failures', async function () {
            await assertRepositoryReadFailureRethrown(new Error('read failed'), /read failed/u);
        });

        test('rethrows non-missing file system failures', async function () {
            await assertRepositoryReadFailureRethrown(
                Object.assign(new Error('access denied'), { code: 'EACCES' }),
                /access denied/u
            );
        });
    });
});
