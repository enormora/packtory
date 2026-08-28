import * as assert from 'node:assert';
import { stripVTControlCharacters } from 'node:util';
import { suite, test } from 'mocha';
import { fake } from 'sinon';
import { Result } from 'true-myth';
import type { Packtory } from '../../packtory/packtory.ts';
import { createConfigLoaderStub } from '../../test-libraries/handler-stub-fixtures.ts';
import type { TerminalSpinnerRenderer } from '../spinner/terminal-spinner-renderer.ts';
import { runPackageSideEffectsHandler } from './package-side-effects-handler.ts';

type PackageSideEffectsOutcome = Awaited<ReturnType<Packtory['inspectPackageSideEffects']>>;

async function unusedPacktoryMethod(): Promise<never> {
    throw new Error('unused packtory method');
}

function packtoryStub(outcome: PackageSideEffectsOutcome): Packtory {
    return {
        analyzeReleaseAgainstLatestPublished: unusedPacktoryMethod,
        buildAndPublishAll: unusedPacktoryMethod,
        diffAgainstLatestPublished: unusedPacktoryMethod,
        inspectPackageDependencies: unusedPacktoryMethod,
        async inspectPackageSideEffects() {
            return outcome;
        },
        inspectPackageTree: unusedPacktoryMethod,
        packAllPackages: unusedPacktoryMethod,
        packPackage: unusedPacktoryMethod,
        planReleaseAgainstLatestPublished: unusedPacktoryMethod,
        resolveAndLinkAll: unusedPacktoryMethod
    };
}

function spinnerRenderer(stopAll: () => void): TerminalSpinnerRenderer {
    return {
        add: fake(),
        updateMessage: fake(),
        stop: fake(),
        stopAll
    };
}

async function renderOutcome(outcome: PackageSideEffectsOutcome, trace: boolean): Promise<string> {
    const log = fake();
    await runPackageSideEffectsHandler({
        log(message) {
            log(stripVTControlCharacters(message));
        },
        packtory: packtoryStub(outcome),
        spinnerRenderer: spinnerRenderer(fake()),
        configLoader: createConfigLoaderStub(),
        flags: { packageName: 'pkg-a', trace }
    });
    return String(log.firstCall.args[0]);
}

suite('package-side-effects-handler', function () {
    test('loads config, renders successful inspection output, and stops spinners', async function () {
        const inspectPackageSideEffects = fake.resolves({
            result: Result.ok({
                packageName: 'pkg-a',
                packageJsonDecision: { type: 'side-effects-false' },
                impureFiles: []
            })
        });
        const log = fake();
        const stopAll = fake();
        const packtory: Packtory = {
            analyzeReleaseAgainstLatestPublished: unusedPacktoryMethod,
            buildAndPublishAll: unusedPacktoryMethod,
            diffAgainstLatestPublished: unusedPacktoryMethod,
            inspectPackageDependencies: unusedPacktoryMethod,
            inspectPackageSideEffects,
            inspectPackageTree: unusedPacktoryMethod,
            packAllPackages: unusedPacktoryMethod,
            packPackage: unusedPacktoryMethod,
            planReleaseAgainstLatestPublished: unusedPacktoryMethod,
            resolveAndLinkAll: unusedPacktoryMethod
        };
        const sideEffectsSpinnerRenderer: TerminalSpinnerRenderer = {
            add: fake(),
            updateMessage: fake(),
            stop: fake(),
            stopAll() {
                stopAll();
            }
        };

        const exitCode = await runPackageSideEffectsHandler({
            log(message) {
                log(message);
            },
            packtory,
            spinnerRenderer: sideEffectsSpinnerRenderer,
            configLoader: createConfigLoaderStub(),
            flags: { packageName: 'pkg-a', trace: false }
        });

        assert.strictEqual(exitCode, 0);
        assert.strictEqual(stopAll.callCount, 2);
        assert.strictEqual(
            log.firstCall.args[0],
            [
                'Packtory side effects [Dry run]',
                'pkg-a',
                'Generated package.json sideEffects: false',
                'No runtime side effects.'
            ]
                .join('\n')
        );
    });

    test('prints config failures', async function () {
        const message = await renderOutcome({
            result: Result.err({ type: 'config', issues: [ 'bad config' ] })
        }, false);

        assert.strictEqual(message, 'Packtory side effects [Dry run]\nConfiguration issues\n- bad config');
    });

    test('prints partial failures without trace', async function () {
        const message = await renderOutcome({
            result: Result.err({
                type: 'partial',
                error: { succeeded: [], failures: [ new Error('resolve failed') ] }
            })
        }, false);

        assert.strictEqual(message, 'Packtory side effects [Dry run]\nPackage failures\n- resolve failed');
    });

    test('prints partial failures with trace', async function () {
        const message = await renderOutcome({
            result: Result.err({
                type: 'partial',
                error: { succeeded: [], failures: [ new Error('resolve failed') ] }
            })
        }, true);

        assert.match(
            message,
            /^Packtory side effects \[Dry run\]\nPackage failures\n- resolve failed\n {2}Stack trace: Error: resolve failed/u
        );
    });

    test('prints package-not-found failures', async function () {
        const message = await renderOutcome({
            result: Result.err({ type: 'package-not-found', packageName: 'missing' })
        }, false);

        assert.strictEqual(message, 'Package "missing" is not declared in the packtory configuration');
    });

    test('prints fallback package failures', async function () {
        const message = await renderOutcome({
            result: Result.err({ type: 'unsafe-output-folder', packageName: 'pkg-a', outputPath: 'dist' })
        }, false);

        assert.strictEqual(message, 'Package side effects could not be inspected');
    });
});
