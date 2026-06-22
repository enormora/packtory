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

const deps = { workingDirectory: '/repo' } as const;

function createChangelogConfig(overrides: Partial<ChangelogConfig> = {}): ChangelogConfig {
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

function createGeneratedChangelog(
    overrides: { readonly packageMarkdownByName?: ReadonlyMap<string, string> } = {}
): GeneratedChangelog {
    return {
        groupedMarkdown: 'grouped',
        packageMarkdownByName: overrides.packageMarkdownByName ?? new Map([['pkg-a', 'package-a']])
    };
}

async function assertRepositoryReadFailureRethrown(error: Error, messagePattern: RegExp): Promise<void> {
    const fileManager = createFakeFileManager({
        simulatedReadFileResponses: [{ error }]
    });

    await assert.rejects(
        writeConfiguredChangelogs(
            { ...deps, fileManager },
            createChangelogConfig({ changelog: { outputs: [{ kind: 'repository-file', path: 'CHANGELOG.md' }] } }),
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

    test('collectGeneratedAttributionPaths returns no paths when outputs are absent', function () {
        assert.deepStrictEqual(
            collectGeneratedAttributionPaths(deps, createChangelogConfig({ changelog: undefined })),
            []
        );
        assert.deepStrictEqual(
            collectGeneratedAttributionPaths(
                deps,
                createChangelogConfig({ changelog: { labels: { operations: 'Operations' } } })
            ),
            []
        );
    });

    test('createChangelogGenerationOptions combines defaults with configured settings', function () {
        const options = createChangelogGenerationOptions(
            createChangelogConfig({
                changelog: {
                    explicitBaseRef: 'main',
                    labels: { bug: 'Fixed Bugs', operations: 'Operations' },
                    packageTagFormat: 'pkg/{packageName}/v{version}',
                    targetScopedLabelPattern: 'scope:{targetName}:{label}'
                }
            })
        );

        assert.strictEqual(options.explicitBaseRef, 'main');
        assert.strictEqual(options.packageTagFormat, 'pkg/{packageName}/v{version}');
        assert.strictEqual(options.targetScopedLabelPattern, 'scope:{targetName}:{label}');
        assert.strictEqual(options.validLabels.get('bug'), 'Fixed Bugs');
        assert.strictEqual(options.validLabels.get('operations'), 'Operations');
    });

    test('collectGeneratedAttributionPaths includes repository and in-repository package files', function () {
        assert.deepStrictEqual(collectGeneratedAttributionPaths(deps, createChangelogConfig()), [
            'CHANGELOG.md',
            'src/pkg-a/docs/CHANGELOG.md'
        ]);
    });

    test('collectGeneratedAttributionPaths uses common sourcesFolder for package files', function () {
        assert.deepStrictEqual(
            collectGeneratedAttributionPaths(
                deps,
                createChangelogConfig({
                    changelog: { outputs: [{ kind: 'package-file', path: 'CHANGELOG.md' }] },
                    packages: [{ name: 'pkg-a' }]
                })
            ),
            ['src/CHANGELOG.md']
        );
    });

    test('collectGeneratedAttributionPaths ignores github-release outputs', function () {
        assert.deepStrictEqual(
            collectGeneratedAttributionPaths(
                deps,
                createChangelogConfig({ changelog: { outputs: [{ kind: 'github-release' }] } })
            ),
            []
        );
    });

    test('collectGeneratedAttributionPaths reports package-file outputs without sourcesFolder', function () {
        assert.throws(() => {
            collectGeneratedAttributionPaths(
                deps,
                createChangelogConfig({
                    changelog: { outputs: [{ kind: 'package-file', path: 'CHANGELOG.md' }] },
                    commonPackageSettings: undefined,
                    packages: [{ name: 'pkg-a' }]
                })
            );
        }, /Config for package "pkg-a" is missing the sources folder/u);
    });

    test('shouldPageGroupedChangelog follows default and github-release output behavior', function () {
        assert.strictEqual(shouldPageGroupedChangelog(undefined), true);
        assert.strictEqual(shouldPageGroupedChangelog([{ kind: 'repository-file', path: 'CHANGELOG.md' }]), false);
        assert.strictEqual(shouldPageGroupedChangelog([{ kind: 'github-release' }]), true);
    });

    test('writeConfiguredChangelogs does nothing when outputs are absent', async function () {
        const fileManager = createFakeFileManager();

        const writtenPaths = await writeConfiguredChangelogs(
            { ...deps, fileManager },
            createChangelogConfig({ changelog: undefined }),
            { updateChangelog: fake.returns('updated') },
            createGeneratedChangelog()
        );

        assert.deepStrictEqual(writtenPaths, []);
        assert.strictEqual(fileManager.getWriteFileCallCount(), 0);
    });

    test('writeConfiguredChangelogs does nothing when outputs are omitted from changelog config', async function () {
        const fileManager = createFakeFileManager();

        const writtenPaths = await writeConfiguredChangelogs(
            { ...deps, fileManager },
            createChangelogConfig({ changelog: { labels: { operations: 'Operations' } } }),
            { updateChangelog: fake.returns('updated') },
            createGeneratedChangelog()
        );

        assert.deepStrictEqual(writtenPaths, []);
        assert.strictEqual(fileManager.getWriteFileCallCount(), 0);
    });

    test('writeConfiguredChangelogs passes empty existing markdown for missing files', async function () {
        const missingFileError = Object.assign(new Error('missing'), { code: 'ENOENT' });
        const fileManager = createFakeFileManager({
            simulatedReadFileResponses: [{ error: missingFileError }]
        });
        const updateChangelog = fake(
            (input: { readonly existingChangelogMarkdown: string; readonly generatedChangelogMarkdown: string }) => {
                assert.strictEqual(input.existingChangelogMarkdown, '');
                return input.generatedChangelogMarkdown;
            }
        );

        const writtenPaths = await writeConfiguredChangelogs(
            { ...deps, fileManager },
            createChangelogConfig({ changelog: { outputs: [{ kind: 'repository-file', path: 'CHANGELOG.md' }] } }),
            { updateChangelog },
            createGeneratedChangelog()
        );

        assert.deepStrictEqual(writtenPaths, ['/repo/CHANGELOG.md']);
        assert.strictEqual(updateChangelog.callCount, 1);
    });

    test('writeConfiguredChangelogs skips empty generated markdown', async function () {
        const fileManager = createFakeFileManager();

        const writtenPaths = await writeConfiguredChangelogs(
            { ...deps, fileManager },
            createChangelogConfig({ changelog: { outputs: [{ kind: 'repository-file', path: 'CHANGELOG.md' }] } }),
            { updateChangelog: fake.returns('updated') },
            { groupedMarkdown: '', packageMarkdownByName: new Map() }
        );

        assert.deepStrictEqual(writtenPaths, []);
        assert.strictEqual(fileManager.getReadFileCallCount(), 0);
        assert.strictEqual(fileManager.getWriteFileCallCount(), 0);
    });

    test('writeConfiguredChangelogs reports package markdown without config', async function () {
        const fileManager = createFakeFileManager();

        await assert.rejects(
            writeConfiguredChangelogs(
                { ...deps, fileManager },
                createChangelogConfig({ changelog: { outputs: [{ kind: 'package-file', path: 'CHANGELOG.md' }] } }),
                { updateChangelog: fake.returns('updated') },
                createGeneratedChangelog({ packageMarkdownByName: new Map([['missing', 'markdown']]) })
            ),
            /Config for package "missing" is missing/u
        );
    });

    test('writeConfiguredChangelogs rethrows non-missing read failures', async function () {
        await assertRepositoryReadFailureRethrown(new Error('read failed'), /read failed/u);
    });

    test('writeConfiguredChangelogs rethrows non-missing file system failures', async function () {
        await assertRepositoryReadFailureRethrown(
            Object.assign(new Error('access denied'), { code: 'EACCES' }),
            /access denied/u
        );
    });
});
