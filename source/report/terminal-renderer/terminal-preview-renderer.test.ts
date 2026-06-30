import assert from 'node:assert';
import { suite, test } from 'mocha';
import {
    createDirectoryDiffPreviewPackageFixture,
    createManifestOnlyPreviewPackageFixture,
    createPreviewDocumentFixture,
    createPreviewPackageFixture
} from '../../test-libraries/preview-fixtures.ts';
import { renderFailureOnlyTerminalPreview, renderTerminalPreview } from './terminal-preview-renderer.ts';

const escapeSequenceStart = String.fromCodePoint(27);

suite('terminal-preview-renderer', function () {
    test('renderTerminalPreview renders the full tree with metadata, badges, and diffs', function () {
        const output = renderTerminalPreview(createPreviewDocumentFixture(), { color: false });

        assert.strictEqual(
            output,
            [
                'Packtory preview [Dry run]',
                '',
                '1 package(s) · 1 changed · 0 failed',
                '',
                'pkg-a 1.0.0 -> 1.0.1',
                '  • package.json (manifest, 2 B) [generated]',
                '  ▸ src/',
                '    • src/index.js (source, 20 B) [changed, DCE]',
                '  Eliminated source files',
                '    - /workspace/src/unused.js (14 B)',
                '  Diffs',
                '    src/index.js',
                '      @@ -1,1 +1,1 @@',
                '      -export const removed = 1;',
                '      +export const kept = 1;',
                ''
            ]
                .join('\n')
        );
        assert.ok(!output.includes('Stryker was here'));
    });

    test('renderFailureOnlyTerminalPreview renders issues and package failures for failure-only runs', function () {
        const output = renderFailureOnlyTerminalPreview(
            createPreviewDocumentFixture({
                previewable: false,
                resultType: 'checks',
                issues: [ 'bundle is too large' ],
                packages: [ createPreviewPackageFixture({ failure: { stage: 'resolveAndLink', message: 'boom' } }) ]
            }),
            { color: false }
        );

        assert.strictEqual(
            output,
            [
                'Packtory preview [Dry run]',
                'Check failures',
                '- bundle is too large',
                'pkg-a resolveAndLink: boom',
                ''
            ]
                .join('\n')
        );
    });

    test('renderTerminalPreview renders issues and package failures in the normal preview view', function () {
        const output = renderTerminalPreview(
            createPreviewDocumentFixture({
                issues: [ 'warning' ],
                packages: [ createPreviewPackageFixture({ failure: { stage: 'publish', message: 'boom' } }) ]
            }),
            { color: false }
        );

        assert.ok(output.includes('Issues'));
        assert.ok(output.includes('- warning'));
        assert.ok(output.includes('failure publish: boom'));
    });

    test('renderTerminalPreview joins multiple issues with newlines and skips directory diff payloads', function () {
        const output = renderTerminalPreview(
            createPreviewDocumentFixture({
                issues: [ 'first', 'second' ],
                packages: [ createDirectoryDiffPreviewPackageFixture() ]
            }),
            { color: false }
        );

        assert.ok(output.includes('Issues\n- first\n- second'));
        assert.ok(!output.includes('src/index.js'));
    });

    test('renderFailureOnlyTerminalPreview renders config and partial headings', function () {
        const configOutput = renderFailureOnlyTerminalPreview(
            createPreviewDocumentFixture({ previewable: false, resultType: 'config', packages: [] }),
            { color: false }
        );
        const partialOutput = renderFailureOnlyTerminalPreview(
            createPreviewDocumentFixture({ previewable: false, resultType: 'partial', packages: [] }),
            { color: false }
        );

        assert.ok(configOutput.includes('Configuration issues'));
        assert.ok(partialOutput.includes('Package failures'));
    });

    test('renderFailureOnlyTerminalPreview omits failure headings for success results', function () {
        const output = renderFailureOnlyTerminalPreview(
            createPreviewDocumentFixture({ previewable: false, resultType: 'success', issues: [] }),
            { color: false }
        );

        assert.strictEqual(output, 'Packtory preview [Dry run]\n');
    });

    test('renderTerminalPreview supports color-enabled rendering', function () {
        const output = renderTerminalPreview(createPreviewDocumentFixture(), { color: true });

        assert.ok(output.includes(`${escapeSequenceStart}[`));
        assert.ok(output.includes('Packtory preview'));
    });

    test('renderTerminalPreview renders context diff lines unchanged', function () {
        const output = renderTerminalPreview(
            createPreviewDocumentFixture({
                packages: [
                    createPreviewPackageFixture({
                        tree: [
                            {
                                path: 'src/index.js',
                                name: 'index.js',
                                depth: 0,
                                type: 'file',
                                artifact: {
                                    path: 'src/index.js',
                                    sizeBytes: 20,
                                    kind: 'source',
                                    status: 'changed',
                                    badges: [],
                                    diff: [
                                        {
                                            header: '@@ -1,2 +1,2 @@',
                                            lines: [ { type: 'context', text: ' unchanged();' } ]
                                        }
                                    ]
                                }
                            }
                        ]
                    })
                ]
            }),
            { color: false }
        );

        assert.ok(output.includes('unchanged();'));
    });

    test('renderTerminalPreview omits the version suffix when no version transition is present', function () {
        const output = renderTerminalPreview(
            createPreviewDocumentFixture({
                packages: [ createPreviewPackageFixture({ versionTransition: undefined }) ]
            }),
            { color: false }
        );

        assert.ok(output.includes('pkg-a'));
        assert.ok(!output.includes('undefined'));
    });

    test('renderTerminalPreview omits issues, eliminated files, and diffs when they are absent', function () {
        const output = renderTerminalPreview(
            createPreviewDocumentFixture({
                issues: [],
                packages: [ createManifestOnlyPreviewPackageFixture() ]
            }),
            { color: false }
        );

        assert.strictEqual(
            output,
            [
                'Packtory preview [Dry run]',
                '',
                '1 package(s) · 1 changed · 0 failed',
                '',
                'pkg-a',
                '  • package.json (manifest, 2 B) [generated]',
                ''
            ]
                .join('\n')
        );
    });
});
