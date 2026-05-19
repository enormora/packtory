import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake, type SinonSpy } from 'sinon';
import type { Packtory } from '../../packtory/packtory.ts';
import { createConfigLoaderStub, createSpinnerRendererStub } from '../../test-libraries/handler-stub-fixtures.ts';
import { runReleaseDiffHandler, type ReleaseDiffHandlerDeps } from './release-diff-handler.ts';

type ReleaseDiffOutcome = Awaited<ReturnType<Packtory['diffAgainstLatestPublished']>>;

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

function depsWith(
    outcome: ReleaseDiffOutcome,
    spies: { readonly log: SinonSpy; readonly pageOutput: SinonSpy }
): ReleaseDiffHandlerDeps {
    return {
        log: (message) => {
            spies.log(message);
        },
        pageOutput: spies.pageOutput,
        packtory: packtoryStub(outcome),
        spinnerRenderer: createSpinnerRendererStub(),
        configLoader: createConfigLoaderStub()
    };
}

suite('release-diff-handler', function () {
    test('returns 0 on success and pages the inline terminal output', async function () {
        const log: SinonSpy = fake();
        const pageOutput: SinonSpy = fake.resolves(undefined);

        const code = await runReleaseDiffHandler(depsWith(emptyOutcome(), { log, pageOutput }));

        assert.strictEqual(code, 0);
        assert.strictEqual(pageOutput.callCount, 1);
    });

    test('returns 1 and routes through the failure-only renderer when the result is a non-previewable failure', async function () {
        const log: SinonSpy = fake();
        const pageOutput: SinonSpy = fake.resolves(undefined);
        const outcome = emptyOutcome({
            result: {
                isOk: false,
                isErr: true,
                error: { type: 'config', issues: ['invalid config'] }
            } as unknown as ReleaseDiffOutcome['result']
        });

        const code = await runReleaseDiffHandler(depsWith(outcome, { log, pageOutput }));

        assert.strictEqual(code, 1);
        assert.strictEqual(pageOutput.callCount, 0);
        assert.strictEqual(log.callCount, 1);
    });

    test('returns 1 and pages the inline output when the result is a previewable partial failure', async function () {
        const log: SinonSpy = fake();
        const pageOutput: SinonSpy = fake.resolves(undefined);
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
                            files: { added: [], removed: [], modified: [], unchanged: [] },
                            diagnostics: { decisions: {}, timings: {} }
                        }
                    ],
                    failures: [new Error('failed package')]
                }
            } as unknown as ReleaseDiffOutcome['result']
        });

        const code = await runReleaseDiffHandler(depsWith(outcome, { log, pageOutput }));

        assert.strictEqual(code, 1);
        assert.strictEqual(pageOutput.callCount, 1);
        assert.strictEqual(log.callCount, 0);
    });
});
