import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake, type SinonSpy } from 'sinon';
import { stagedForApproval } from '../../bundle-emitter/publication-outcome.ts';
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
    flags: {
        readonly noDryRun: boolean;
        readonly stage: boolean;
        readonly reportJson: boolean;
        readonly reportHtml: boolean;
    },
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

suite('publish-handler', function () {
    test('runPublishHandler returns 0 and logs a success summary when the build succeeds', async function () {
        const { code, messages } = await captureMessages(
            { noDryRun: true, stage: false, reportJson: false, reportHtml: false },
            buildOutcome({
                // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- only isErr/value matter to the handler
                result: { isOk: true, isErr: false, value: [{ name: 'pkg-a' }] } as never
            })
        );

        assert.strictEqual(code, 0);
        assert.ok(messages.some((message) => message.includes('all 1 package(s) have been published')));
    });

    test('runPublishHandler passes stage mode through to the success summary', async function () {
        const { code, messages } = await captureMessages(
            { noDryRun: true, stage: true, reportJson: false, reportHtml: false },
            buildOutcome({
                // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- only handler-visible fields matter here
                result: {
                    isOk: true,
                    isErr: false,
                    value: [
                        {
                            bundle: { name: 'pkg-a', version: '1.0.0' },
                            publication: stagedForApproval('stage-123'),
                            status: 'new-version'
                        }
                    ]
                } as never
            })
        );

        assert.strictEqual(code, 0);
        assert.ok(messages.some((message) => message.includes('staged 1 package(s)')));
        assert.ok(messages.some((message) => message.includes('stage-123')));
    });

    test('runPublishHandler returns 1 and logs the publish failure when the build fails', async function () {
        const { code, messages } = await captureMessages(
            { noDryRun: true, stage: false, reportJson: false, reportHtml: false },
            buildOutcome({
                // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- only isErr/error.type matter to the handler
                result: { isOk: false, isErr: true, error: { type: 'config', issues: ['missing field'] } } as never
            })
        );

        assert.strictEqual(code, 1);
        assert.ok(messages.some((message) => message.includes('The provided config is invalid')));
    });

    test('runPublishHandler passes stage mode through to the publish failure summary', async function () {
        const { code, messages } = await captureMessages(
            { noDryRun: true, stage: true, reportJson: false, reportHtml: false },
            buildOutcome({
                // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- only handler-visible fields matter here
                result: {
                    isOk: false,
                    isErr: true,
                    error: {
                        type: 'partial',
                        succeeded: [
                            {
                                bundle: { name: 'pkg-a', version: '1.0.0' },
                                publication: stagedForApproval('stage-123')
                            }
                        ],
                        failures: [new Error('boom')]
                    }
                } as never
            })
        );

        assert.strictEqual(code, 1);
        assert.ok(messages.some((message) => message.includes('Staged packages')));
        assert.ok(messages.some((message) => message.includes('stage-123')));
    });

    test('runPublishHandler appends the dry-run reminder when noDryRun is false', async function () {
        const { messages } = await captureMessages(
            { noDryRun: false, stage: false, reportJson: false, reportHtml: false },
            buildOutcome()
        );

        assert.ok(messages.some((message) => message.includes('dry-run mode was enabled')));
    });

    test('runPublishHandler stops spinners exactly once when the build throws', async function () {
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
                flags: { noDryRun: true, stage: false, reportJson: false, reportHtml: false }
            });
            assert.fail('Expected runPublishHandler to throw');
        } catch (error: unknown) {
            assert.strictEqual((error as Error).message, 'boom');
        }
        assert.strictEqual(stopAllSpy.callCount, 1);
    });
});
