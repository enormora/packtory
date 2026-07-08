import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { GeneratedChangelog } from '../../packtory/packtory-changelog.ts';
import {
    collectGitHubReleaseNotes,
    type GitHubReleaseNotesDeps,
    type ReleaseNotesTarget
} from './github-release-notes.ts';
import type { ChangelogConfig } from './changelog-destinations.ts';

const target: ReleaseNotesTarget = {
    name: '@scope/pkg-a',
    tagName: '@scope/pkg-a@1.0.1',
    version: '1.0.1'
};

const config: ChangelogConfig = {
    packages: [
        { name: 'pkg-b', sourcesFolder: 'packages/pkg-b' },
        { name: '@scope/pkg-a', sourcesFolder: 'packages/pkg-a' }
    ],
    changelog: {
        outputs: [ { kind: 'package-file', path: 'CHANGELOG.md' } ]
    }
};

function changelog(markdownByName: ReadonlyMap<string, string> = new Map()): GeneratedChangelog {
    return {
        groupedMarkdown: '',
        packageNamesWithoutChangelogEntries: [],
        packageMarkdownByName: markdownByName
    };
}

function readFileDeps(contentByPath: ReadonlyMap<string, string>): GitHubReleaseNotesDeps {
    return {
        workingDirectory: '/repo',
        fileManager: {
            async readFile(filePath: string): Promise<string> {
                const content = contentByPath.get(filePath);
                if (content === undefined) {
                    const error = new Error(`Missing file ${filePath}`);
                    Object.assign(error, { code: 'ENOENT' });
                    throw error;
                }
                return content;
            }
        }
    };
}

function markdown(...lines: readonly string[]): string {
    return lines.join('\n');
}

function registerGeneratedNotesTests(): void {
    test('keeps generated release notes without reading changelog files', async function () {
        let readCount = 0;
        const result = await collectGitHubReleaseNotes(
            {
                workingDirectory: '/repo',
                fileManager: {
                    async readFile(): Promise<string> {
                        readCount += 1;
                        return 'unused';
                    }
                }
            },
            config,
            [ target ],
            changelog(new Map([ [ target.name, '## @scope/pkg-a 1.0.1\n\n* Fix package' ] ]))
        );

        assert.strictEqual(result.get(target.name), '## @scope/pkg-a 1.0.1\n\n* Fix package');
        assert.strictEqual(readCount, 0);
    });

    test('recovers when generated release notes are whitespace only', async function () {
        const result = await collectGitHubReleaseNotes(
            readFileDeps(
                new Map([
                    [
                        '/repo/packages/pkg-a/CHANGELOG.md',
                        markdown('## @scope/pkg-a 1.0.1 (June 13, 2026)', '', '* Recovered package notes')
                    ]
                ])
            ),
            config,
            [ target ],
            changelog(new Map([ [ target.name, ' '.repeat(3) ] ]))
        );

        assert.strictEqual(
            result.get(target.name),
            markdown('## @scope/pkg-a 1.0.1 (June 13, 2026)', '', '* Recovered package notes')
        );
    });
}

function registerRecoveryTests(): void {
    test('recovers scoped package release notes from the configured package changelog', async function () {
        const result = await collectGitHubReleaseNotes(
            readFileDeps(
                new Map([
                    [
                        '/repo/packages/pkg-a/CHANGELOG.md',
                        markdown(
                            '## @scope/pkg-a 1.0.1 (June 13, 2026)',
                            '',
                            '* Fix package',
                            '* Keep multiline notes',
                            '',
                            '## @scope/pkg-a 1.0.0 (June 1, 2026)',
                            '',
                            '* Previous release'
                        )
                    ]
                ])
            ),
            config,
            [ target ],
            changelog()
        );

        assert.strictEqual(
            result.get(target.name),
            markdown('## @scope/pkg-a 1.0.1 (June 13, 2026)', '', '* Fix package', '* Keep multiline notes')
        );
    });

    test('recovers release notes from a changelog section at end of file', async function () {
        const result = await collectGitHubReleaseNotes(
            readFileDeps(
                new Map([
                    [
                        '/repo/packages/pkg-a/CHANGELOG.md',
                        markdown(
                            '## @scope/pkg-a 1.0.2 (June 14, 2026)',
                            '',
                            '* Newer release',
                            '',
                            '## @scope/pkg-a 1.0.1 (June 13, 2026)',
                            '',
                            '* Last release'
                        )
                    ]
                ])
            ),
            config,
            [ target ],
            changelog()
        );

        assert.strictEqual(
            result.get(target.name),
            markdown('## @scope/pkg-a 1.0.1 (June 13, 2026)', '', '* Last release')
        );
    });

    test('recovers unscoped release notes from an explicit package changelog path', async function () {
        const unscopedTarget = { name: 'pkg-a', tagName: 'pkg-a@1.0.1', version: '1.0.1' };
        const result = await collectGitHubReleaseNotes(
            readFileDeps(
                new Map([
                    [
                        '/repo/changelogs/pkg-a.md',
                        markdown(
                            '## 1.0.1 (June 13, 2026)',
                            '',
                            '* Fix package',
                            '',
                            '## 1.0.0 (June 1, 2026)',
                            '',
                            '* Previous release'
                        )
                    ]
                ])
            ),
            {
                packages: [ { name: 'pkg-a', sourcesFolder: 'packages/pkg-a' } ],
                changelog: { outputs: [ { kind: 'package-file', paths: { 'pkg-a': 'changelogs/pkg-a.md' } } ] }
            },
            [ unscopedTarget ],
            changelog()
        );

        assert.strictEqual(result.get('pkg-a'), markdown('## 1.0.1 (June 13, 2026)', '', '* Fix package'));
    });
}

function registerFailureTests(): void {
    test('does not recover notes from another package changelog path', async function () {
        await assert.rejects(
            collectGitHubReleaseNotes(
                readFileDeps(
                    new Map([
                        [
                            '/repo/packages/pkg-b/CHANGELOG.md',
                            markdown('## @scope/pkg-a 1.0.1 (June 13, 2026)', '', '* Wrong file')
                        ]
                    ])
                ),
                config,
                [ target ],
                changelog()
            ),
            /GitHub release notes for "@scope\/pkg-a@1\.0\.1" could not be generated/u
        );
    });

    test('rejects when the configured changelog has no matching release section', async function () {
        await assert.rejects(
            collectGitHubReleaseNotes(
                readFileDeps(
                    new Map([
                        [
                            '/repo/packages/pkg-a/CHANGELOG.md',
                            markdown('## @scope/pkg-a 1.0.2 (June 14, 2026)', '', '* Newer release')
                        ]
                    ])
                ),
                config,
                [ target ],
                changelog()
            ),
            /GitHub release notes for "@scope\/pkg-a@1\.0\.1" could not be generated/u
        );
    });

    test('rejects when the configured changelog has no release headings', async function () {
        await assert.rejects(
            collectGitHubReleaseNotes(
                readFileDeps(
                    new Map([
                        [
                            '/repo/packages/pkg-a/CHANGELOG.md',
                            markdown('Changelog', '', '* No release heading')
                        ]
                    ])
                ),
                config,
                [ target ],
                changelog()
            ),
            /GitHub release notes for "@scope\/pkg-a@1\.0\.1" could not be generated/u
        );
    });

    test('rejects when no package changelog output is configured', async function () {
        let readCount = 0;
        await assert.rejects(
            collectGitHubReleaseNotes(
                {
                    workingDirectory: '/repo',
                    fileManager: {
                        async readFile(): Promise<string> {
                            readCount += 1;
                            throw new Error('unexpected read');
                        }
                    }
                },
                {
                    packages: [ { name: '@scope/pkg-a', sourcesFolder: 'packages/pkg-a' } ],
                    changelog: { outputs: [ { kind: 'repository-file', path: 'CHANGELOG.md' } ] }
                },
                [ target ],
                changelog()
            ),
            /GitHub release notes for "@scope\/pkg-a@1\.0\.1" could not be generated/u
        );
        assert.strictEqual(readCount, 0);
    });

    test('rejects missing and whitespace-only release sections', async function () {
        await assert.rejects(
            collectGitHubReleaseNotes(
                readFileDeps(
                    new Map([
                        [
                            '/repo/packages/pkg-a/CHANGELOG.md',
                            markdown(
                                '## @scope/pkg-a 1.0.2 (June 14, 2026)',
                                '',
                                '* Newer release',
                                '',
                                '## @scope/pkg-a 1.0.1 (June 13, 2026)',
                                ' '.repeat(3),
                                '## @scope/pkg-a 1.0.0 (June 1, 2026)',
                                '',
                                '* Previous release'
                            )
                        ]
                    ])
                ),
                config,
                [ target ],
                changelog()
            ),
            /GitHub release notes for "@scope\/pkg-a@1\.0\.1" could not be generated/u
        );
    });

    test('propagates unexpected changelog read failures', async function () {
        await assert.rejects(
            collectGitHubReleaseNotes(
                {
                    workingDirectory: '/repo',
                    fileManager: {
                        async readFile(): Promise<string> {
                            throw new Error('permission denied');
                        }
                    }
                },
                config,
                [ target ],
                changelog()
            ),
            /permission denied/u
        );
    });
}

suite('github-release-notes', function () {
    registerGeneratedNotesTests();
    registerRecoveryTests();
    registerFailureTests();
});
