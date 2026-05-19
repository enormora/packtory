import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { PackageReleaseDiff } from '../release-diff/file-set-diff.ts';
import { createColors } from './terminal-preview-renderer-shared.ts';
import { renderReleaseDiffPackage } from './terminal-release-diff-package-renderer.ts';

const colors = createColors(false);

function basePkg(overrides: Partial<PackageReleaseDiff> = {}): PackageReleaseDiff {
    return {
        name: 'pkg-a',
        state: 'changed',
        versionTransition: '1.0.0 -> 1.0.1',
        previousVersionLabel: '1.0.0',
        files: { added: [], removed: [], modified: [], unchanged: [] },
        diagnostics: { decisions: {}, timings: {} },
        ...overrides
    };
}

suite('terminal-release-diff-package-renderer', function () {
    test('renders the unchanged state as a single dim no-changes line including the previous version', function () {
        const output = renderReleaseDiffPackage(basePkg({ state: 'unchanged' }), colors);
        assert.strictEqual(output, 'pkg-a  1.0.0  ·  no changes');
    });

    test('renders the first-publish state with chip line and Added group of bundled files', function () {
        const output = renderReleaseDiffPackage(
            basePkg({
                state: 'first-publish',
                versionTransition: '(unpublished) -> 1.0.0',
                previousVersionLabel: '(unpublished)',
                files: {
                    added: [
                        { path: 'package.json', sizeBytes: 2, isExecutable: false },
                        { path: 'lib/index.js', sizeBytes: 20, isExecutable: false }
                    ],
                    removed: [],
                    modified: [],
                    unchanged: []
                }
            }),
            colors
        );

        assert.match(output, /pkg-a {2}\(unpublished\) -> 1\.0\.0/u);
        assert.match(output, /\[first publish\] {2}showing all bundled files as added/u);
        assert.match(output, /Added \(2\)/u);
        assert.match(output, /package\.json/u);
        assert.match(output, /lib\//u);
        assert.match(output, /index\.js/u);
    });

    test('renders changed-state header with summary, added, removed and modified groups', function () {
        const output = renderReleaseDiffPackage(
            basePkg({
                files: {
                    added: [{ path: 'lib/new.js', sizeBytes: 12, isExecutable: false }],
                    removed: [{ path: 'lib/legacy.js', sizeBytes: 4, isExecutable: false }],
                    modified: [
                        {
                            path: 'package.json',
                            oldSizeBytes: 32,
                            newSizeBytes: 35,
                            oldIsExecutable: false,
                            newIsExecutable: false,
                            contentChange: {
                                kind: 'text',
                                hunks: [
                                    {
                                        header: '@@ -1,1 +1,1 @@',
                                        lines: [
                                            { type: 'remove', text: '-"version": "1.0.0"' },
                                            { type: 'add', text: '+"version": "1.0.1"' }
                                        ]
                                    }
                                ]
                            }
                        }
                    ],
                    unchanged: [{ path: 'readme.md', sizeBytes: 10, isExecutable: false }]
                }
            }),
            colors
        );

        assert.match(output, /pkg-a {2}1\.0\.0 -> 1\.0\.1/u);
        assert.match(output, /1 added, 1 removed, 1 modified, 1 unchanged/u);
        assert.match(output, /Added \(1\)/u);
        assert.match(output, /\+ new\.js/u);
        assert.match(output, /Removed \(1\)/u);
        assert.match(output, /- legacy\.js/u);
        assert.match(output, /Modified \(1\)/u);
        assert.match(output, /@@ -1,1 \+1,1 @@/u);
        assert.match(output, /-"version": "1\.0\.0"/u);
        assert.match(output, /\+"version": "1\.0\.1"/u);
    });

    test('renders a binary modification with a no-text-diff annotation', function () {
        const output = renderReleaseDiffPackage(
            basePkg({
                files: {
                    added: [],
                    removed: [],
                    modified: [
                        {
                            path: 'assets/logo.png',
                            oldSizeBytes: 100,
                            newSizeBytes: 110,
                            oldIsExecutable: false,
                            newIsExecutable: false,
                            contentChange: { kind: 'binary' }
                        }
                    ],
                    unchanged: []
                }
            }),
            colors
        );
        assert.match(output, /binary, no text diff/u);
    });

    test('renders a mode-only change with mode delta and a mode-only annotation', function () {
        const output = renderReleaseDiffPackage(
            basePkg({
                files: {
                    added: [],
                    removed: [],
                    modified: [
                        {
                            path: 'bin/cli.js',
                            oldSizeBytes: 50,
                            newSizeBytes: 50,
                            oldIsExecutable: false,
                            newIsExecutable: true,
                            contentChange: { kind: 'mode-only' }
                        }
                    ],
                    unchanged: []
                }
            }),
            colors
        );
        assert.match(output, /mode 644 -> 755/u);
        assert.match(output, /mode only/u);
    });

    test('renders the reverse mode change (executable dropped) with mode delta 755 -> 644', function () {
        const output = renderReleaseDiffPackage(
            basePkg({
                files: {
                    added: [],
                    removed: [],
                    modified: [
                        {
                            path: 'bin/cli.js',
                            oldSizeBytes: 50,
                            newSizeBytes: 50,
                            oldIsExecutable: true,
                            newIsExecutable: false,
                            contentChange: { kind: 'mode-only' }
                        }
                    ],
                    unchanged: []
                }
            }),
            colors
        );
        assert.match(output, /mode 755 -> 644/u);
    });

    test('omits empty status groups from changed-state output', function () {
        const output = renderReleaseDiffPackage(
            basePkg({
                files: {
                    added: [{ path: 'a.js', sizeBytes: 1, isExecutable: false }],
                    removed: [],
                    modified: [],
                    unchanged: []
                }
            }),
            colors
        );
        assert.match(output, /Added \(1\)/u);
        assert.doesNotMatch(output, /Removed/u);
        assert.doesNotMatch(output, /Modified/u);
    });
});
