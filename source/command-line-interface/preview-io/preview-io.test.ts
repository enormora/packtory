import assert from 'node:assert';
import { suite, test } from 'mocha';
import { withPromiseDeadline } from '../../test-libraries/promise-with-deadline.ts';
import { createDefaultPreviewIo } from './preview-io.ts';

async function ignoreOpenFile(filePath: string): Promise<void> {
    assert.strictEqual(typeof filePath, 'string');
}

suite('preview-io', function () {
    test('createDefaultPreviewIo exposes the default preview helpers', function () {
        const previewIo = createDefaultPreviewIo({
            openFile: ignoreOpenFile,
            shell: 'sh',
            pager: undefined,
            stdoutIsTTY: true
        });

        assert.strictEqual(typeof previewIo.createTemporaryPreviewHtmlPath, 'function');
        assert.strictEqual(typeof previewIo.pagePreviewOutput, 'function');
        assert.strictEqual(typeof previewIo.openPreviewFile, 'function');
        assert.ok(previewIo.createTemporaryPreviewHtmlPath().includes('packtory-preview-'));
    });

    test('createDefaultPreviewIo falls back to the default spawn process when no custom spawner is injected', async function () {
        const previewIo = createDefaultPreviewIo({
            openFile: ignoreOpenFile,
            shell: 'sh',
            pager: 'cat >/dev/null',
            stdoutIsTTY: true,
            randomUuid() {
                return 'uuid-123';
            },
            tmpdir() {
                return '/var/folders';
            }
        });

        assert.strictEqual(
            await withPromiseDeadline(previewIo.pagePreviewOutput('hello'), 'default preview io fallback spawner', 500),
            true
        );
    });

    test('createDefaultPreviewIo uses an injected file opener', async function () {
        const openedFiles: string[] = [];
        const previewIo = createDefaultPreviewIo({
            async openFile(filePath) {
                openedFiles.push(filePath);
            },
            shell: 'sh',
            pager: undefined,
            stdoutIsTTY: true
        });

        assert.strictEqual(
            await withPromiseDeadline(previewIo.openPreviewFile('/var/folders/report.html'), 'default preview open'),
            true
        );
        assert.deepStrictEqual(openedFiles, [ '/var/folders/report.html' ]);
    });
});
