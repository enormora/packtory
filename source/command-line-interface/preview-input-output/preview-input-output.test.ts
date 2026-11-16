import assert from 'node:assert';
import { suite, test } from 'mocha';
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
            standardOutputIsTerminal: true,
            randomUniqueIdentifier() {
                return 'preview-id';
            },
            temporaryDirectory() {
                return '/virtual';
            }
        });
        assert.strictEqual(typeof previewInputOutput.createTemporaryPreviewHypertextMarkupLanguagePath, 'function');
        assert.strictEqual(typeof previewInputOutput.pagePreviewOutput, 'function');
        assert.strictEqual(typeof previewInputOutput.openPreviewFile, 'function');
        assert.ok(
            previewInputOutput.createTemporaryPreviewHypertextMarkupLanguagePath().includes(
                'packtory-preview-preview-id.html'
            )
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
        assert.strictEqual(await previewInputOutput.openPreviewFile('/var/folders/report.html'), true);
        assert.deepStrictEqual(openedFiles, [ '/var/folders/report.html' ]);
    });
});
