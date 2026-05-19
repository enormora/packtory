import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake, type SinonSpy } from 'sinon';
import type { Packtory } from '../../packtory/packtory.ts';
import { createFakeFileManager } from '../../test-libraries/fake-file-manager.ts';
import { createConfigLoaderStub, createSpinnerRendererStub } from '../../test-libraries/handler-stub-fixtures.ts';
import { runPreviewHandler } from './preview-handler.ts';

type BuildOutcome = Awaited<ReturnType<Packtory['buildAndPublishAll']>>;

function packtoryStub(outcome: BuildOutcome): Packtory {
    return { buildAndPublishAll: fake.resolves(outcome) } as unknown as Packtory;
}

function emptyOutcome(overrides: Partial<BuildOutcome> = {}): BuildOutcome {
    return {
        getReport: () => undefined,
        result: { isOk: true, isErr: false, value: [] },
        ...overrides
    } as unknown as BuildOutcome;
}

suite('preview-handler', function () {
    test('runPreviewHandler returns 0 on success and pages the inline terminal preview', async function () {
        const pageSpy: SinonSpy = fake.resolves(undefined);

        const code = await runPreviewHandler({
            log: () => undefined,
            pageOutput: pageSpy,
            openFile: fake.resolves(true),
            createTemporaryFilePath: () => '/var/folders/preview.html',
            packtory: packtoryStub(emptyOutcome()),
            spinnerRenderer: createSpinnerRendererStub(),
            configLoader: createConfigLoaderStub(),
            fileManager: createFakeFileManager(),
            flags: { open: false }
        });

        assert.strictEqual(code, 0);
        assert.strictEqual(pageSpy.callCount, 1);
    });

    test('runPreviewHandler returns 1 when the build fails', async function () {
        const code = await runPreviewHandler({
            log: () => undefined,
            pageOutput: fake.resolves(undefined),
            openFile: fake.resolves(true),
            createTemporaryFilePath: () => '/var/folders/preview.html',
            packtory: packtoryStub(
                emptyOutcome({
                    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- the preview-handler only inspects isOk/isErr; full Result shape is irrelevant here
                    result: { isOk: false, isErr: true, error: { type: 'config', issues: [] } } as never
                })
            ),
            spinnerRenderer: createSpinnerRendererStub(),
            configLoader: createConfigLoaderStub(),
            fileManager: createFakeFileManager(),
            flags: { open: false }
        });

        assert.strictEqual(code, 1);
    });

    test('runPreviewHandler writes the HTML report to a temporary file when the open flag is set', async function () {
        const fileManager = createFakeFileManager();
        const openSpy: SinonSpy = fake.resolves(true);

        await runPreviewHandler({
            log: () => undefined,
            pageOutput: fake.resolves(undefined),
            openFile: openSpy,
            createTemporaryFilePath: () => '/var/folders/preview.html',
            packtory: packtoryStub(emptyOutcome()),
            spinnerRenderer: createSpinnerRendererStub(),
            configLoader: createConfigLoaderStub(),
            fileManager,
            flags: { open: true }
        });

        assert.strictEqual(openSpy.callCount, 1);
        assert.strictEqual(fileManager.getWriteFileCallCount(), 1);
        assert.strictEqual(fileManager.getWriteFileCall(0).filePath, '/var/folders/preview.html');
    });

    test('runPreviewHandler logs the temporary file path when openFile reports failure', async function () {
        const messages: string[] = [];

        await runPreviewHandler({
            log: (message) => {
                messages.push(message);
            },
            pageOutput: fake.resolves(undefined),
            openFile: fake.resolves(false),
            createTemporaryFilePath: () => '/var/folders/preview.html',
            packtory: packtoryStub(emptyOutcome()),
            spinnerRenderer: createSpinnerRendererStub(),
            configLoader: createConfigLoaderStub(),
            fileManager: createFakeFileManager(),
            flags: { open: true }
        });

        assert.deepStrictEqual(messages, ['/var/folders/preview.html']);
    });
});
