import assert from 'node:assert';
import { suite, test } from 'mocha';
import { withPromiseDeadline } from '../../test-libraries/promise-with-deadline.ts';
import { createDefaultPreviewIo } from './preview-io.ts';

suite('preview-io', function () {
    test('createDefaultPreviewIo exposes the default preview helpers', function () {
        const previewIo = createDefaultPreviewIo({
            platform: 'linux',
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
            platform: 'linux',
            shell: 'sh',
            pager: 'cat >/dev/null',
            stdoutIsTTY: true,
            randomUuid: () => 'uuid-123',
            tmpdir: () => '/tmp'
        });

        assert.strictEqual(
            await withPromiseDeadline(previewIo.pagePreviewOutput('hello'), 'default preview io fallback spawner'),
            true
        );
    });
});
