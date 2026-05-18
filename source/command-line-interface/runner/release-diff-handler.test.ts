import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake, type SinonSpy } from 'sinon';
import type { Packtory } from '../../packtory/packtory.ts';
import type { ConfigLoader } from '../config-loader.ts';
import type { TerminalSpinnerRenderer } from '../spinner/terminal-spinner-renderer.ts';
import { runReleaseDiffHandler } from './release-diff-handler.ts';

type ReleaseDiffOutcome = Awaited<ReturnType<Packtory['diffAgainstLatestPublished']>>;

function spinnerRendererStub(): TerminalSpinnerRenderer {
    return { stopAll: fake() } as unknown as TerminalSpinnerRenderer;
}

function configLoaderStub(): ConfigLoader {
    return { load: fake.resolves({}) } as unknown as ConfigLoader;
}

function packtoryStub(outcome: ReleaseDiffOutcome): Packtory {
    return { diffAgainstLatestPublished: fake.resolves(outcome) } as unknown as Packtory;
}

function emptyOutcome(overrides: Partial<ReleaseDiffOutcome> = {}): ReleaseDiffOutcome {
    return {
        getReport: () => undefined,
        result: { isOk: true, isErr: false, value: [] },
        ...overrides
    } as unknown as ReleaseDiffOutcome;
}

suite('release-diff-handler', function () {
    test('returns 0 on success and pages the inline terminal output', async function () {
        const pageSpy: SinonSpy = fake.resolves(undefined);

        const code = await runReleaseDiffHandler({
            log: () => {
                /* discard */
            },
            pageOutput: pageSpy,
            packtory: packtoryStub(emptyOutcome()),
            spinnerRenderer: spinnerRendererStub(),
            configLoader: configLoaderStub()
        });

        assert.strictEqual(code, 0);
        assert.strictEqual(pageSpy.callCount, 1);
    });

    test('returns 1 and routes through the failure-only renderer when the result is a non-previewable failure', async function () {
        const logSpy: SinonSpy = fake();
        const pageSpy: SinonSpy = fake.resolves(undefined);

        const code = await runReleaseDiffHandler({
            log: (message) => {
                logSpy(message);
            },
            pageOutput: pageSpy,
            packtory: packtoryStub(
                emptyOutcome({
                    result: {
                        isOk: false,
                        isErr: true,
                        error: { type: 'config', issues: ['invalid config'] }
                    } as unknown as ReleaseDiffOutcome['result']
                })
            ),
            spinnerRenderer: spinnerRendererStub(),
            configLoader: configLoaderStub()
        });

        assert.strictEqual(code, 1);
        assert.strictEqual(pageSpy.callCount, 0);
        assert.strictEqual(logSpy.callCount, 1);
    });

    test('returns 1 and pages the inline output when the result is a previewable partial failure', async function () {
        const pageSpy: SinonSpy = fake.resolves(undefined);
        const logSpy: SinonSpy = fake();

        const code = await runReleaseDiffHandler({
            log: (message) => {
                logSpy(message);
            },
            pageOutput: pageSpy,
            packtory: packtoryStub(
                emptyOutcome({
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
                                    files: { added: [], removed: [], modified: [], unchanged: [] },
                                    diagnostics: { decisions: {}, timings: {} }
                                }
                            ],
                            failures: [new Error('failed package')]
                        }
                    } as unknown as ReleaseDiffOutcome['result']
                })
            ),
            spinnerRenderer: spinnerRendererStub(),
            configLoader: configLoaderStub()
        });

        assert.strictEqual(code, 1);
        assert.strictEqual(pageSpy.callCount, 1);
        assert.strictEqual(logSpy.callCount, 0);
    });
});
