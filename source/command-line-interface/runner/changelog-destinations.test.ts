import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake } from 'sinon';
import type { GeneratedChangelog } from '../../packtory/packtory-changelog.ts';
import { createFakeFileManager } from '../../test-libraries/fake-file-manager.ts';
import {
    collectGeneratedAttributionPaths,
    createChangelogGenerationOptions,
    parseValidConfig,
    shouldPageGroupedChangelog,
    writeConfiguredChangelogs,
    type ChangelogConfig
} from './changelog-destinations.ts';

const dependencies = { workingDirectory: '/repo' } as const;

type GeneratedChangelogOverrides = {
    readonly packageMarkdownByName?: ReadonlyMap<string, string>;
};
type ChangelogUpdateInput = {
    readonly existingChangelogMarkdown: string;
    readonly generatedChangelogMarkdown: string;
};

function createChangelogConfig(overrides: Readonly<Partial<ChangelogConfig>> = {}): ChangelogConfig {
    return {
        changelog: {
            outputs: [
                { kind: 'repository-file', path: 'CHANGELOG.md' },
                { kind: 'package-file', path: 'docs/CHANGELOG.md' },
                { kind: 'github-release' }
            ]
        },
        commonPackageSettings: { sourcesFolder: 'src' },
        packages: [
            { name: 'pkg-a', sourcesFolder: 'src/pkg-a' },
            { name: 'pkg-b', sourcesFolder: '/external/pkg-b' }
        ],
        ...overrides
    };
}

function createGeneratedChangelog(overrides: GeneratedChangelogOverrides = {}): GeneratedChangelog {
    return {
        groupedMarkdown: 'grouped',
        packageNamesWithoutChangelogEntries: [],
        packageMarkdownByName: overrides.packageMarkdownByName ?? new Map([ [ 'pkg-a', 'package-a' ] ])
    };
}

function createPacktoryConfigWithPrLog(prLog: unknown): unknown {
    return {
        changelog: { prLog },
        packages: [
            {
                mainPackageJson: { type: 'module' },
                name: 'pkg-a',
                publishSettings: { access: 'public' },
                roots: { main: { js: 'index.js' } },
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
            createChangelogConfig({ changelog: { outputs: [ { kind: 'repository-file', path: 'CHANGELOG.md' } ] } }),
            { updateChangelog: fake.returns('updated') },
            createGeneratedChangelog()
        ),
        messagePattern
    );
}

suite('changelog-destinations', function () {
    test('parseValidConfig returns undefined for invalid configs', function () {
        assert.strictEqual(parseValidConfig({ packages: [] }), undefined);
    });

    test('parseValidConfig returns undefined for non-object pr-log settings', function () {
        assert.strictEqual(parseValidConfig(createPacktoryConfigWithPrLog(null)), undefined);
        assert.strictEqual(parseValidConfig(createPacktoryConfigWithPrLog('invalid')), undefined);
    });

    test('parseValidConfig accepts object pr-log settings', function () {
        assert.notStrictEqual(
            parseValidConfig(createPacktoryConfigWithPrLog({ validLabels: { bug: 'Bugs' } })),
            undefined
        );
    });

    test('createChangelogGenerationOptions combines defaults with configured settings', function () {
        const options = createChangelogGenerationOptions(
            createChangelogConfig({
                changelog: {
                    explicitBaseRef: 'main',
                    prLog: { validLabels: { bug: 'Fixed Bugs', operations: 'Operations' } },
                    packageTagFormat: 'pkg/{packageName}/v{version}',
                    targetScopedLabelPattern: 'scope:{targetName}:{label}'
                }
            })
        );

        assert.partialDeepStrictEqual(options, {
            explicitBaseRef: 'main',
            packageTagFormat: 'pkg/{packageName}/v{version}',
            targetScopedLabelPattern: 'scope:{targetName}:{label}'
        });
        assert.strictEqual(options.prLogConfig.validLabels.get('bug'), 'Fixed Bugs');
        assert.strictEqual(options.prLogConfig.validLabels.get('operations'), 'Operations');
    });

    suite('collectGeneratedAttributionPaths', function () {
        test('returns no paths when outputs are absent', function () {
            assert.deepStrictEqual(
                collectGeneratedAttributionPaths(dependencies, createChangelogConfig({ changelog: undefined })),
                []
            );
            assert.deepStrictEqual(
                collectGeneratedAttributionPaths(
                    dependencies,
                    createChangelogConfig({ changelog: { prLog: { validLabels: { operations: 'Operations' } } } })
                ),
                []
            );
        });

        test('includes repository and in-repository package files', function () {
            assert.deepStrictEqual(collectGeneratedAttributionPaths(dependencies, createChangelogConfig()), [
                'CHANGELOG.md',
                'src/pkg-a/docs/CHANGELOG.md'
            ]);
        });

        test('uses common sourcesFolder for package files', function () {
            assert.deepStrictEqual(
                collectGeneratedAttributionPaths(
                    dependencies,
                    createChangelogConfig({
                        changelog: { outputs: [ { kind: 'package-file', path: 'CHANGELOG.md' } ] },
                        packages: [ { name: 'pkg-a' } ]
                    })
                ),
                [ 'src/CHANGELOG.md' ]
            );
        });

        test('includes explicit package file paths', function () {
            assert.deepStrictEqual(
                collectGeneratedAttributionPaths(
                    dependencies,
                    createChangelogConfig({
                        changelog: {
                            outputs: [
                                {
                                    kind: 'package-file',
                                    paths: {
                                        'pkg-a': 'packages/pkg-a/CHANGELOG.md',
                                        'pkg-b': 'packages/pkg-b/CHANGELOG.md'
                                    }
                                }
                            ]
                        },
                        commonPackageSettings: undefined,
                        packages: [ { name: 'pkg-a' }, { name: 'pkg-b' } ]
                    })
                ),
                [ 'packages/pkg-a/CHANGELOG.md', 'packages/pkg-b/CHANGELOG.md' ]
            );
        });

        test('ignores github-release outputs', function () {
            assert.deepStrictEqual(
                collectGeneratedAttributionPaths(
                    dependencies,
                    createChangelogConfig({ changelog: { outputs: [ { kind: 'github-release' } ] } })
                ),
                []
            );
        });

        test('reports package-file outputs without sourcesFolder', function () {
            assert.throws(function () {
                collectGeneratedAttributionPaths(
                    dependencies,
                    createChangelogConfig({
                        changelog: { outputs: [ { kind: 'package-file', path: 'CHANGELOG.md' } ] },
                        commonPackageSettings: undefined,
                        packages: [ { name: 'pkg-a' } ]
                    })
                );
            }, /Config for package "pkg-a" is missing the sources folder/u);
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
                createChangelogConfig({ changelog: undefined }),
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
                createChangelogConfig({ changelog: { prLog: { validLabels: { operations: 'Operations' } } } }),
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
                createChangelogConfig({
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
                createChangelogConfig({
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
                    createChangelogConfig({
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
                    createChangelogConfig({
                        changelog: { outputs: [ { kind: 'package-file', path: 'CHANGELOG.md' } ] },
                        commonPackageSettings: undefined,
                        packages: [ { name: 'pkg-a' } ]
                    }),
                    { updateChangelog: fake.returns('updated') },
                    createGeneratedChangelog({ packageMarkdownByName: new Map([ [ 'pkg-a', 'markdown' ] ]) })
                ),
                /Config for package "pkg-a" is missing the sources folder/u
            );
        });

        test('uses common sourcesFolder for package-file outputs', async function () {
            const fileManager = createFakeFileManager();

            const writtenPaths = await writeConfiguredChangelogs(
                { ...dependencies, fileManager },
                createChangelogConfig({
                    changelog: { outputs: [ { kind: 'package-file', path: 'CHANGELOG.md' } ] },
                    packages: [ { name: 'pkg-a' } ]
                }),
                { updateChangelog: fake.returns('updated') },
                createGeneratedChangelog({ packageMarkdownByName: new Map([ [ 'pkg-a', 'markdown' ] ]) })
            );

            assert.deepStrictEqual(writtenPaths, [ '/repo/src/CHANGELOG.md' ]);
        });

        test('writes explicit package-file changelog outputs', async function () {
            const fileManager = createFakeFileManager();

            const writtenPaths = await writeConfiguredChangelogs(
                { ...dependencies, fileManager },
                createChangelogConfig({
                    changelog: {
                        outputs: [
                            {
                                kind: 'package-file',
                                paths: {
                                    'pkg-a': 'packages/pkg-a/CHANGELOG.md',
                                    'pkg-b': 'packages/pkg-b/CHANGELOG.md'
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
                        [ 'pkg-a', 'package-a' ],
                        [ 'pkg-b', 'package-b' ]
                    ])
                })
            );

            assert.deepStrictEqual(writtenPaths, [
                '/repo/packages/pkg-a/CHANGELOG.md',
                '/repo/packages/pkg-b/CHANGELOG.md'
            ]);
            assert.deepStrictEqual(fileManager.getAllWriteFileCalls(), [
                { filePath: '/repo/packages/pkg-a/CHANGELOG.md', content: 'package-a' },
                { filePath: '/repo/packages/pkg-b/CHANGELOG.md', content: 'package-b' }
            ]);
        });

        test('reports package markdown without an explicit path', async function () {
            const fileManager = createFakeFileManager();

            await assert.rejects(
                writeConfiguredChangelogs(
                    { ...dependencies, fileManager },
                    createChangelogConfig({
                        changelog: {
                            outputs: [
                                {
                                    kind: 'package-file',
                                    paths: { 'pkg-a': 'packages/pkg-a/CHANGELOG.md' }
                                }
                            ]
                        }
                    }),
                    { updateChangelog: fake.returns('updated') },
                    createGeneratedChangelog({
                        packageMarkdownByName: new Map([
                            [ 'pkg-a', 'package-a' ],
                            [ 'pkg-b', 'package-b' ]
                        ])
                    })
                ),
                /Changelog output path for package "pkg-b" is missing/u
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
