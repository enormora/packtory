import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createPackageReleaseDiff as basePkg } from '../../test-libraries/release-diff-fixtures.ts';
import { createColors } from './terminal-preview-renderer-shared.ts';
import { renderReleaseDiffPackage } from './terminal-release-diff-package-renderer.ts';

const colors = createColors(false);

suite('terminal-release-diff-package-renderer', function () {
    test('renders the unchanged state as exactly one dim no-changes line including the previous version', function () {
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

        assert.strictEqual(
            output,
            [
                'pkg-a  (unpublished) -> 1.0.0',
                '  [first publish]  showing all bundled files as added',
                '  Added (2)',
                '  + package.json (2 B)',
                '    ▸ lib/',
                '    + index.js (20 B)'
            ].join('\n')
        );
    });

    test('renders an entire changed-state package as a deterministic, indent-correct sequence of lines', function () {
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

        assert.strictEqual(
            output,
            [
                'pkg-a  1.0.0 -> 1.0.1  ·  1 added, 1 removed, 1 modified, 1 unchanged',
                '  Added (1)',
                '    ▸ lib/',
                '    + new.js (12 B)',
                '  Removed (1)',
                '    ▸ lib/',
                '    - legacy.js (4 B)',
                '  Modified (1)',
                '  ~ package.json (32 B -> 35 B)',
                '      @@ -1,1 +1,1 @@',
                '      -"version": "1.0.0"',
                '      +"version": "1.0.1"'
            ].join('\n')
        );
    });

    test('renders a binary modification with no hunks and a "(binary, no text diff)" annotation', function () {
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
        assert.strictEqual(
            output,
            [
                'pkg-a  1.0.0 -> 1.0.1  ·  0 added, 0 removed, 1 modified, 0 unchanged',
                '  Modified (1)',
                '    ▸ assets/',
                '    ~ logo.png (100 B -> 110 B) (binary, no text diff)'
            ].join('\n')
        );
    });

    test('renders a mode-only change with mode delta 644 -> 755 and a "(mode only)" annotation', function () {
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
        assert.strictEqual(
            output,
            [
                'pkg-a  1.0.0 -> 1.0.1  ·  0 added, 0 removed, 1 modified, 0 unchanged',
                '  Modified (1)',
                '    ▸ bin/',
                '    ~ cli.js (50 B -> 50 B) mode 644 -> 755 (mode only)'
            ].join('\n')
        );
    });

    test('renders the reverse mode change with mode delta 755 -> 644', function () {
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
        assert.strictEqual(
            output,
            [
                'pkg-a  1.0.0 -> 1.0.1  ·  1 added, 0 removed, 0 modified, 0 unchanged',
                '  Added (1)',
                '  + a.js (1 B)'
            ].join('\n')
        );
    });
});
