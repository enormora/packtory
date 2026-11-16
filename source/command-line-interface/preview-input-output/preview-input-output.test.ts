import assert from 'node:assert';
import path from 'node:path';
import { suite, test } from 'mocha';
import { fake } from 'sinon';
import { withPromiseDeadline } from '../../test-libraries/promise-with-deadline.ts';
import type { SpawnFunction } from './preview-process.ts';
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
        assert.strictEqual(
            previewInputOutput.createTemporaryPreviewHypertextMarkupLanguagePath(),
            path.join('/virtual', 'packtory-preview-preview-id.html')
        );
    });

    test('createDefaultPreviewInputOutput uses the injected process launcher', async function () {
        const contents: string[] = [];
        const child: ReturnType<SpawnFunction> = {
            standardInput: {
                on: fake(),
                end(content) {
                    contents.push(content);
                }
            },
            on(eventName, listener) {
                if (eventName === 'close') {
                    listener(0);
                }
            },
            unref: fake()
        };
        const spawnProcess = fake.returns(child);
        const previewInputOutput = createDefaultPreviewInputOutput({
            openFile: ignoreOpenFile,
            spawnProcess,
            shell: 'preview-shell',
            pager: 'preview-pager',
            standardOutputIsTerminal: true
        });

        assert.strictEqual(
            await withPromiseDeadline(previewInputOutput.pagePreviewOutput('report'), 'injected preview launcher'),
            true
        );
        assert.deepStrictEqual(spawnProcess.args, [ [
            'preview-shell',
            [ '-lc', 'preview-pager' ],
            { stdio: [ 'pipe', 'inherit', 'inherit' ] }
        ] ]);
        assert.deepStrictEqual(contents, [ 'report' ]);
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
