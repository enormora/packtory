import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake } from 'sinon';
import type { GeneratedChangelog } from '../../packtory/packtory-changelog.ts';
import type { ChangelogConfig } from './changelog-destinations.ts';
import { collectGitHubReleaseNotes } from './github-release-notes.ts';

const target = {
    name: 'pkg-a',
    tagName: 'pkg-a@1.0.1',
    version: '1.0.1'
};
const secondTarget = {
    name: 'pkg-b',
    tagName: 'pkg-b@1.0.1',
    version: '1.0.1'
};

const config: ChangelogConfig = {
    changelog: { outputs: [ { kind: 'package-file', path: 'CHANGELOG.md' } ] },
    packages: [ { name: 'pkg-a', sourcesFolder: 'packages/pkg-a' } ]
};
const explicitPathConfig: ChangelogConfig = {
    changelog: {
        outputs: [
            { kind: 'package-file', paths: { 'pkg-a': 'changelogs/pkg-a.md', 'pkg-b': 'changelogs/pkg-b.md' } }
        ]
    },
    packages: [
        { name: 'pkg-a', sourcesFolder: 'packages/pkg-a' },
        { name: 'pkg-b', sourcesFolder: 'packages/pkg-b' }
    ]
};

function generatedChangelog(packageMarkdownByName: ReadonlyMap<string, string>): GeneratedChangelog {
    return {
        groupedMarkdown: '',
        packageMarkdownByName,
        packageNamesWithoutChangelogEntries: []
    };
}

suite('github-release-notes', function () {
    suite('collection', function () {
        test('uses generated package release notes', async function () {
            const readFile = fake.rejects(new Error('unexpected read'));

            const notes = await collectGitHubReleaseNotes(
                { fileManager: { readFile }, workingDirectory: '/repo' },
                config,
                [ target ],
                generatedChangelog(new Map([ [ 'pkg-a', '## pkg-a 1.0.1\n\n* Generated' ] ]))
            );

            assert.strictEqual(notes.get('pkg-a'), '## pkg-a 1.0.1\n\n* Generated');
            assert.strictEqual(readFile.callCount, 0);
        });
    });

    suite('recovery', function () {
        test('recovers missing package release notes from the configured package changelog', async function () {
            const readFile = fake.resolves('# Changelog\n\n## pkg-a 1.0.1\n\n* Recovered\n\n## pkg-a 1.0.0\n\n* Old');

            const notes = await collectGitHubReleaseNotes(
                { fileManager: { readFile }, workingDirectory: '/repo' },
                config,
                [ target ],
                generatedChangelog(new Map())
            );

            assert.strictEqual(notes.get('pkg-a'), '## pkg-a 1.0.1\n\n* Recovered');
            assert.strictEqual(readFile.firstCall.args[0], '/repo/packages/pkg-a/CHANGELOG.md');
        });

        test('recovers release notes with a version-only heading', async function () {
            const readFile = fake.resolves('# Changelog\n\n## 1.0.1 (2026-06-13)\n\n* Recovered');

            const notes = await collectGitHubReleaseNotes(
                { fileManager: { readFile }, workingDirectory: '/repo' },
                config,
                [ target ],
                generatedChangelog(new Map([ [ 'pkg-a', ' '.repeat(3) ] ]))
            );

            assert.strictEqual(notes.get('pkg-a'), '## 1.0.1 (2026-06-13)\n\n* Recovered');
        });

        test('recovers release notes from the matching explicit package changelog path', async function () {
            const readFile = fake.resolves('## pkg-a 1.0.1\n\n* Recovered');

            const notes = await collectGitHubReleaseNotes(
                { fileManager: { readFile }, workingDirectory: '/repo' },
                explicitPathConfig,
                [ target ],
                generatedChangelog(new Map())
            );

            assert.strictEqual(notes.get('pkg-a'), '## pkg-a 1.0.1\n\n* Recovered');
            assert.strictEqual(readFile.firstCall.args[0], '/repo/changelogs/pkg-a.md');
        });

        test('selects the matching explicit path for later package outputs', async function () {
            const readFile = fake.resolves('## pkg-b 1.0.1\n\n* Recovered');

            const notes = await collectGitHubReleaseNotes(
                { fileManager: { readFile }, workingDirectory: '/repo' },
                explicitPathConfig,
                [ secondTarget ],
                generatedChangelog(new Map())
            );

            assert.strictEqual(notes.get('pkg-b'), '## pkg-b 1.0.1\n\n* Recovered');
            assert.strictEqual(readFile.firstCall.args[0], '/repo/changelogs/pkg-b.md');
        });
    });

    suite('rejections', function () {
        test('rejects when no package changelog output path is configured', async function () {
            const readFile = fake.resolves('unexpected');

            await assert.rejects(
                collectGitHubReleaseNotes(
                    { fileManager: { readFile }, workingDirectory: '/repo' },
                    { changelog: { outputs: [ { kind: 'github-release' } ] }, packages: [ { name: 'pkg-a' } ] },
                    [ target ],
                    generatedChangelog(new Map())
                ),
                /GitHub release notes for "pkg-a@1.0.1" could not be generated/u
            );
            assert.strictEqual(readFile.callCount, 0);
        });

        test('rejects configured changelogs without a matching release heading', async function () {
            const readFile = fake.resolves('# Changelog\n\n## pkg-a 1.0.0\n\n* Old');

            await assert.rejects(
                collectGitHubReleaseNotes(
                    { fileManager: { readFile }, workingDirectory: '/repo' },
                    config,
                    [ target ],
                    generatedChangelog(new Map())
                ),
                /GitHub release notes for "pkg-a@1.0.1" could not be generated/u
            );
        });

        test('rejects configured changelogs without release headings', async function () {
            const readFile = fake.resolves('# Changelog\n\nNo release headings yet.');

            await assert.rejects(
                collectGitHubReleaseNotes(
                    { fileManager: { readFile }, workingDirectory: '/repo' },
                    config,
                    [ target ],
                    generatedChangelog(new Map())
                ),
                /GitHub release notes for "pkg-a@1.0.1" could not be generated/u
            );
        });

        test('rejects configured changelogs whose matching release heading has only whitespace', async function () {
            const readFile = fake.resolves('# Changelog\n\n## pkg-a 1.0.1\n  \n## pkg-a 1.0.0\n\n* Old');

            await assert.rejects(
                collectGitHubReleaseNotes(
                    { fileManager: { readFile }, workingDirectory: '/repo' },
                    config,
                    [ target ],
                    generatedChangelog(new Map())
                ),
                /GitHub release notes for "pkg-a@1.0.1" could not be generated/u
            );
        });

        test('rejects when the configured changelog file is missing', async function () {
            const missingFile = Object.assign(new Error('missing file'), { code: 'ENOENT' });
            const readFile = fake.rejects(missingFile);

            await assert.rejects(
                collectGitHubReleaseNotes(
                    { fileManager: { readFile }, workingDirectory: '/repo' },
                    config,
                    [ target ],
                    generatedChangelog(new Map())
                ),
                /GitHub release notes for "pkg-a@1.0.1" could not be generated/u
            );
        });

        test('rethrows configured changelog read failures', async function () {
            const readFailure = new Error('permission denied');
            const readFile = fake.rejects(readFailure);

            await assert.rejects(
                collectGitHubReleaseNotes(
                    { fileManager: { readFile }, workingDirectory: '/repo' },
                    config,
                    [ target ],
                    generatedChangelog(new Map())
                ),
                /permission denied/u
            );
        });

        test('rejects targets without generated or configured release notes', async function () {
            const readFile = fake.resolves('# Changelog\n\n## pkg-a 1.0.1');

            await assert.rejects(
                collectGitHubReleaseNotes(
                    { fileManager: { readFile }, workingDirectory: '/repo' },
                    config,
                    [ target ],
                    generatedChangelog(new Map())
                ),
                /GitHub release notes for "pkg-a@1.0.1" could not be generated/u
            );
        });
    });
});
