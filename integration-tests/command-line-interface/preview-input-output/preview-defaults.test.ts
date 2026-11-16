import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createDefaultPreviewInputOutput } from '../../../source/command-line-interface/preview-input-output/preview-input-output.ts';

async function ignoreOpenFile(filePath: string): Promise<void> {
    assert.strictEqual(typeof filePath, 'string');
}

suite('preview-input-output', function () {
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
        assert.strictEqual(await previewInputOutput.pagePreviewOutput('hello'), true);
    });
});
