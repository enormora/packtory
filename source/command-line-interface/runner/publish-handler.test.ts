import assert from 'node:assert';
import { test } from 'mocha';
import { fake, type SinonSpy } from 'sinon';
import type { Packtory } from '../../packtory/packtory.ts';
import { createFakeFileManager } from '../../test-libraries/fake-file-manager.ts';
import {
    buildOutcome,
    configLoaderStub,
    packtoryStub,
    spinnerRendererStub
} from '../../test-libraries/cli-handler-fixtures.ts';
import type { TerminalSpinnerRenderer } from '../spinner/terminal-spinner-renderer.ts';
import { runPublishHandler } from './publish-handler.ts';

type BuildOutcome = Awaited<ReturnType<Packtory['buildAndPublishAll']>>;

async function captureMessages(
    flags: { readonly noDryRun: boolean; readonly reportJson: boolean; readonly reportHtml: boolean },
    outcome: BuildOutcome
): Promise<{ readonly code: number; readonly messages: readonly string[] }> {
    const messages: string[] = [];
    const code = await runPublishHandler({
        log: (message) => {
            messages.push(message);
        },
        packtory: packtoryStub(outcome),
        spinnerRenderer: spinnerRendererStub(),
        configLoader: configLoaderStub(),
        fileManager: createFakeFileManager(),
        flags
    });
    return { code, messages };
}

test('runPublishHandler returns 0 and logs a success summary when the build succeeds', async () => {
    const { code, messages } = await captureMessages(
        { noDryRun: true, reportJson: false, reportHtml: false },
        buildOutcome({
            // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- only isErr/value matter to the handler
            result: { isOk: true, isErr: false, value: [{ name: 'pkg-a' }] } as never
        })
    );

    assert.strictEqual(code, 0);
    assert.ok(messages.some((message) => message.includes('all 1 package(s) have been published')));
});

test('runPublishHandler returns 1 and logs the publish failure when the build fails', async () => {
    const { code, messages } = await captureMessages(
        { noDryRun: true, reportJson: false, reportHtml: false },
        buildOutcome({
            // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- only isErr/error.type matter to the handler
            result: { isOk: false, isErr: true, error: { type: 'config', issues: ['missing field'] } } as never
        })
    );

    assert.strictEqual(code, 1);
    assert.ok(messages.some((message) => message.includes('The provided config is invalid')));
});

test('runPublishHandler appends the dry-run reminder when noDryRun is false', async () => {
    const { messages } = await captureMessages(
        { noDryRun: false, reportJson: false, reportHtml: false },
        buildOutcome()
    );

    assert.ok(messages.some((message) => message.includes('dry-run mode was enabled')));
});

test('runPublishHandler stops spinners exactly once when the build throws', async () => {
    const stopAllSpy: SinonSpy = fake();
    const spinner = { stopAll: stopAllSpy } as unknown as TerminalSpinnerRenderer;
    const packtory = { buildAndPublishAll: fake.rejects(new Error('boom')) } as unknown as Packtory;

    try {
        await runPublishHandler({
            log: () => undefined,
            packtory,
            spinnerRenderer: spinner,
            configLoader: configLoaderStub(),
            fileManager: createFakeFileManager(),
            flags: { noDryRun: true, reportJson: false, reportHtml: false }
        });
        assert.fail('Expected runPublishHandler to throw');
    } catch (error: unknown) {
        assert.strictEqual((error as Error).message, 'boom');
    }
    assert.strictEqual(stopAllSpy.callCount, 1);
});
