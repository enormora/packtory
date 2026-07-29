import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake, type SinonSpy } from 'sinon';
import { Result } from 'true-myth';
import { stagedForApproval } from '../../bundle-emitter/publication-outcome.ts';
import { configError, publishPartialFailure } from '../../packtory/packtory-results.ts';
import type { Packtory } from '../../packtory/packtory.ts';
import {
    buildOutcome,
    configLoaderStub,
    fileManagerStub,
    packtoryStub,
    spinnerRendererStub
} from '../../test-libraries/cli-handler-fixtures.ts';
import { createBuildResultFixture } from '../../test-libraries/preview-fixtures.ts';
import { runPublishHandler } from './publish-handler.ts';

type BuildOutcome = Awaited<ReturnType<Packtory['buildAndPublishAll']>>;
type PublishFlags = {
    readonly noDryRun: boolean;
    readonly stage: boolean;
    readonly reportJson: boolean;
    readonly reportHtml: boolean;
};
type CapturedPublishMessages = {
    readonly code: number;
    readonly messages: readonly string[];
};

async function captureMessages(
    flags: PublishFlags,
    outcome: BuildOutcome
): Promise<CapturedPublishMessages> {
    const messages: string[] = [];
    const code = await runPublishHandler({
        log(message) {
            messages.push(message);
        },
        packtory: packtoryStub(outcome),
        spinnerRenderer: spinnerRendererStub(),
        configLoader: configLoaderStub(),
        fileManager: fileManagerStub(),
        flags
    });
    return { code, messages };
}

suite('publish-handler', function () {
    test('runPublishHandler returns 0 and logs a success summary when the build succeeds', async function () {
        const { code, messages } = await captureMessages(
            { noDryRun: true, stage: false, reportJson: false, reportHtml: false },
            buildOutcome({
                result: Result.ok([ createBuildResultFixture() ])
            })
        );

        assert.strictEqual(code, 0);
        assert.ok(messages.some(function (message) {
            return message.includes('all 1 package(s) have been published');
        }));
    });

    test('runPublishHandler passes stage mode through to the success summary', async function () {
        const { code, messages } = await captureMessages(
            { noDryRun: true, stage: true, reportJson: false, reportHtml: false },
            buildOutcome({
                result: Result.ok([
                    createBuildResultFixture({
                        publication: stagedForApproval('stage-123')
                    })
                ])
            })
        );

        assert.strictEqual(code, 0);
        assert.ok(messages.some(function (message) {
            return message.includes('staged 1 package(s)');
        }));
        assert.ok(messages.some(function (message) {
            return message.includes('stage-123');
        }));
    });

    test('runPublishHandler returns 1 and logs the publish failure when the build fails', async function () {
        const { code, messages } = await captureMessages(
            { noDryRun: true, stage: false, reportJson: false, reportHtml: false },
            buildOutcome({
                result: Result.err(configError([ 'missing field' ]))
            })
        );

        assert.strictEqual(code, 1);
        assert.ok(messages.some(function (message) {
            return message.includes('The provided config is invalid');
        }));
    });

    test('runPublishHandler passes stage mode through to the publish failure summary', async function () {
        const { code, messages } = await captureMessages(
            { noDryRun: true, stage: true, reportJson: false, reportHtml: false },
            buildOutcome({
                result: Result.err(
                    publishPartialFailure({
                        succeeded: [
                            createBuildResultFixture({
                                publication: stagedForApproval('stage-123')
                            })
                        ],
                        failures: [ new Error('boom') ]
                    })
                )
            })
        );

        assert.strictEqual(code, 1);
        assert.ok(messages.some(function (message) {
            return message.includes('Staged packages');
        }));
        assert.ok(messages.some(function (message) {
            return message.includes('stage-123');
        }));
    });

    test('runPublishHandler appends the dry-run reminder when noDryRun is false', async function () {
        const { messages } = await captureMessages(
            { noDryRun: false, stage: false, reportJson: false, reportHtml: false },
            buildOutcome()
        );

        assert.ok(messages.some(function (message) {
            return message.includes('dry-run mode was enabled');
        }));
    });

    test('runPublishHandler stops spinners exactly once when the build throws', async function () {
        const stopAllSpy: SinonSpy = fake();
        const spinner = { ...spinnerRendererStub(), stopAll: stopAllSpy };
        const packtory = { buildAndPublishAll: fake.rejects(new Error('boom')) } as unknown as Packtory;

        try {
            await runPublishHandler({
                log() {
                    return undefined;
                },
                packtory,
                spinnerRenderer: spinner,
                configLoader: configLoaderStub(),
                fileManager: fileManagerStub(),
                flags: { noDryRun: true, stage: false, reportJson: false, reportHtml: false }
            });
            assert.fail('Expected runPublishHandler to throw');
        } catch (error: unknown) {
            assert.strictEqual((error as Error).message, 'boom');
        }
        assert.strictEqual(stopAllSpy.callCount, 1);
    });
});
