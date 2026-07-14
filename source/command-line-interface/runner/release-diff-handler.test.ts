import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake, type SinonSpy } from 'sinon';
import { assertDeepSubset } from '../../test-libraries/deep-subset-assertion.ts';
import type { Packtory } from '../../packtory/packtory.ts';
import { createConfigLoaderStub } from '../../test-libraries/handler-stub-fixtures.ts';
import type { TerminalSpinnerRenderer } from '../spinner/terminal-spinner-renderer.ts';
import { runReleaseDiffHandler, type ReleaseDiffHandlerDependencies } from './release-diff-handler.ts';

type ReleaseDiffOutcome = Awaited<ReturnType<Packtory['diffAgainstLatestPublished']>>;

function spinnerRendererCapturing(stopAll: SinonSpy): TerminalSpinnerRenderer {
    return { stopAll } as unknown as TerminalSpinnerRenderer;
}

function packtoryStub(outcome: ReleaseDiffOutcome): Packtory {
    return { diffAgainstLatestPublished: fake.resolves(outcome) } as unknown as Packtory;
}

function emptyOutcome(overrides: Partial<ReleaseDiffOutcome> = {}): ReleaseDiffOutcome {
    return {
        getReport() {
            return {
                schemaVersion: 1,
                generatedAt: '2026-05-19T00:00:00.000Z',
                packages: {},
                aggregate: { crossBundleLinks: [] }
            };
        },
        result: { isOk: true, isErr: false, value: [] },
        ...overrides
    } as unknown as ReleaseDiffOutcome;
}

type Spies = {
    readonly log: SinonSpy;
    readonly pageOutput: SinonSpy;
    readonly stopAll: SinonSpy;
};

function dependenciesWith(outcome: ReleaseDiffOutcome, spies: Spies): ReleaseDiffHandlerDependencies {
    return {
        log(message) {
            spies.log(message);
        },
        pageOutput: spies.pageOutput,
        packtory: packtoryStub(outcome),
        spinnerRenderer: spinnerRendererCapturing(spies.stopAll),
        configLoader: createConfigLoaderStub()
    };
}

function makeSpies(): Spies {
    return { log: fake(), pageOutput: fake.resolves(undefined), stopAll: fake() };
}

suite('release-diff-handler', function () {
    test('returns 0 on success and pages the inline terminal output', async function () {
        const spies = makeSpies();

        const code = await runReleaseDiffHandler(dependenciesWith(emptyOutcome(), spies));

        assert.strictEqual(code, 0);
        assert.strictEqual(spies.pageOutput.callCount, 1);
    });

    test('calls spinnerRenderer.stopAll both immediately after the build (so the spinner stops before paging) and again in the finally block', async function () {
        const spies = makeSpies();
        await runReleaseDiffHandler(dependenciesWith(emptyOutcome(), spies));
        assert.strictEqual(spies.stopAll.callCount, 2);
    });

    test('calls spinnerRenderer.stopAll in the finally block when the build path throws unexpectedly', async function () {
        const spies = makeSpies();
        const throwingPacktory: Packtory = {
            diffAgainstLatestPublished: fake.rejects(new Error('boom'))
        } as unknown as Packtory;

        try {
            await runReleaseDiffHandler({
                log(message) {
                    spies.log(message);
                },
                pageOutput: spies.pageOutput,
                packtory: throwingPacktory,
                spinnerRenderer: spinnerRendererCapturing(spies.stopAll),
                configLoader: createConfigLoaderStub()
            });
            assert.fail('expected the handler to rethrow');
        } catch (error) {
            assert.ok(error instanceof Error);
            assert.strictEqual(error.message, 'boom');
        }
        assert.strictEqual(spies.stopAll.callCount, 1);
    });

    test('returns 1 and routes through the failure-only renderer when the result is a non-previewable failure', async function () {
        const spies = makeSpies();
        const outcome = emptyOutcome({
            result: {
                isOk: false,
                isErr: true,
                error: { type: 'config', issues: [ 'invalid config' ] }
            } as unknown as ReleaseDiffOutcome['result']
        });

        const code = await runReleaseDiffHandler(dependenciesWith(outcome, spies));

        assert.strictEqual(code, 1);
        assertDeepSubset(spies, {
            pageOutput: {
                callCount: 0
            },
            log: {
                callCount: 1
            }
        });
        const loggedMessage = spies.log.firstCall.args[0] as string;
        assert.match(loggedMessage, /Configuration issues/u);
        assert.ok(!loggedMessage.endsWith('\n'), 'expected failure-only log to be trimEnd-ed');
    });

    test('returns 1, pages the inline output, and forwards the partial succeeded packages into the rendered document', async function () {
        const spies = makeSpies();
        const outcome = emptyOutcome({
            result: {
                isOk: false,
                isErr: true,
                error: {
                    type: 'partial',
                    succeeded: [
                        {
                            name: 'pkg-a',
                            state: 'first-publish',
                            versionTransition: '(unpublished) -> 1.0.0',
                            previousVersionLabel: '(unpublished)',
                            files: { added: [], removed: [], modified: [], unchanged: [] }
                        }
                    ],
                    failures: [ new Error('failed package') ]
                }
            } as unknown as ReleaseDiffOutcome['result']
        });

        const code = await runReleaseDiffHandler(dependenciesWith(outcome, spies));

        assert.strictEqual(code, 1);
        assertDeepSubset(spies, {
            pageOutput: {
                callCount: 1
            },
            log: {
                callCount: 0
            }
        });
        const pagedMessage = spies.pageOutput.firstCall.args[0] as string;
        assert.match(pagedMessage, /pkg-a/u);
        assert.match(pagedMessage, /\[first publish\]/u);
    });
});
