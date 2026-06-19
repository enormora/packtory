import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake } from 'sinon';
import type { GeneratedChangelog } from '../../packtory/packtory-changelog.ts';
import { createFakeFileManager } from '../../test-libraries/fake-file-manager.ts';
import {
    generatedAttributionPaths,
    parseValidConfig,
    shouldPageGroupedChangelog,
    writeConfiguredChangelogs,
    type ChangelogConfig
} from './changelog-destinations.ts';

const deps = { workingDirectory: '/repo' } as const;

function config(overrides: Partial<ChangelogConfig> = {}): ChangelogConfig {
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

function generatedChangelog(
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
            config({ changelog: { outputs: [{ kind: 'repository-file', path: 'CHANGELOG.md' }] } }),
            { updateChangelog: fake.returns('updated') },
            generatedChangelog()
        ),
        messagePattern
    );
}

suite('changelog-destinations', function () {
    test('parseValidConfig returns undefined for invalid configs', function () {
        assert.strictEqual(parseValidConfig({ packages: [] }), undefined);
    });

    test('generatedAttributionPaths returns no paths when outputs are absent', function () {
        assert.deepStrictEqual(generatedAttributionPaths(deps, config({ changelog: undefined })), []);
    });

    test('generatedAttributionPaths includes repository and in-repository package files', function () {
        assert.deepStrictEqual(generatedAttributionPaths(deps, config()), [
            'CHANGELOG.md',
            'src/pkg-a/docs/CHANGELOG.md'
        ]);
    });

    test('generatedAttributionPaths uses common sourcesFolder for package files', function () {
        assert.deepStrictEqual(
            generatedAttributionPaths(
                deps,
                config({
                    changelog: { outputs: [{ kind: 'package-file', path: 'CHANGELOG.md' }] },
                    packages: [{ name: 'pkg-a' }]
                })
            ),
            ['src/CHANGELOG.md']
        );
    });

    test('generatedAttributionPaths ignores github-release outputs', function () {
        assert.deepStrictEqual(
            generatedAttributionPaths(deps, config({ changelog: { outputs: [{ kind: 'github-release' }] } })),
            []
        );
    });

    test('generatedAttributionPaths reports package-file outputs without sourcesFolder', function () {
        assert.throws(() => {
            generatedAttributionPaths(
                deps,
                config({
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

        await writeConfiguredChangelogs(
            { ...deps, fileManager },
            config({ changelog: undefined }),
            { updateChangelog: fake.returns('updated') },
            generatedChangelog()
        );

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

        await writeConfiguredChangelogs(
            { ...deps, fileManager },
            config({ changelog: { outputs: [{ kind: 'repository-file', path: 'CHANGELOG.md' }] } }),
            { updateChangelog },
            generatedChangelog()
        );

        assert.strictEqual(updateChangelog.callCount, 1);
    });

    test('writeConfiguredChangelogs skips empty generated markdown', async function () {
        const fileManager = createFakeFileManager();

        await writeConfiguredChangelogs(
            { ...deps, fileManager },
            config({ changelog: { outputs: [{ kind: 'repository-file', path: 'CHANGELOG.md' }] } }),
            { updateChangelog: fake.returns('updated') },
            { groupedMarkdown: '', packageMarkdownByName: new Map() }
        );

        assert.strictEqual(fileManager.getReadFileCallCount(), 0);
        assert.strictEqual(fileManager.getWriteFileCallCount(), 0);
    });

    test('writeConfiguredChangelogs reports package markdown without config', async function () {
        const fileManager = createFakeFileManager();

        await assert.rejects(
            writeConfiguredChangelogs(
                { ...deps, fileManager },
                config({ changelog: { outputs: [{ kind: 'package-file', path: 'CHANGELOG.md' }] } }),
                { updateChangelog: fake.returns('updated') },
                generatedChangelog({ packageMarkdownByName: new Map([['missing', 'markdown']]) })
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
