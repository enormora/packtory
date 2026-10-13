import assert from 'node:assert';
import { suite, test } from 'mocha';
import { withPromiseDeadline } from '../../test-libraries/promise-with-deadline.ts';
import { createDefaultPreviewInputOutput } from './preview-input-output.ts';

async function ignoreOpenFile(filePath: string): Promise<void> {
    assert.strictEqual(typeof filePath, 'string');
}

suite('preview-input-output', function () {
    test('createDefaultPreviewInputOutput exposes the default preview helpers', function () {
        const previewInputOutput = createDefaultPreviewInputOutput({
            openFile: ignoreOpenFile,
            shell: 'sh',
            pager: undefined,
            standardOutputIsTerminal: true
        });

        assert.strictEqual(typeof previewInputOutput.createTemporaryPreviewHypertextMarkupLanguagePath, 'function');
        assert.strictEqual(typeof previewInputOutput.pagePreviewOutput, 'function');
        assert.strictEqual(typeof previewInputOutput.openPreviewFile, 'function');
        assert.ok(previewInputOutput.createTemporaryPreviewHypertextMarkupLanguagePath().includes('packtory-preview-'));
    });

    test('createDefaultPreviewInputOutput falls back to the default spawn process when no custom spawner is injected', async function () {
        const previewInputOutput = createDefaultPreviewInputOutput({
            openFile: ignoreOpenFile,
            shell: 'sh',
            pager: 'cat >/dev/null',
            standardOutputIsTerminal: true,
            randomUniqueIdentifier() {
                return 'uuid-123';
            },
            temporaryDirectory() {
                return '/var/folders';
            }
        });

        assert.strictEqual(
            await withPromiseDeadline(
                previewInputOutput.pagePreviewOutput('hello'),
                'default preview io fallback spawner',
                500
            ),
            true
        );
    });

    test('createDefaultPreviewInputOutput uses an injected file opener', async function () {
        const openedFiles: string[] = [];
        const previewInputOutput = createDefaultPreviewInputOutput({
            async openFile(filePath) {
                openedFiles.push(filePath);
            },
            shell: 'sh',
            pager: undefined,
            standardOutputIsTerminal: true
        });

        assert.strictEqual(
            await withPromiseDeadline(
                previewInputOutput.openPreviewFile('/var/folders/report.html'),
                'default preview open'
            ),
            true
        );
        assert.deepStrictEqual(openedFiles, [ '/var/folders/report.html' ]);
    });
});
