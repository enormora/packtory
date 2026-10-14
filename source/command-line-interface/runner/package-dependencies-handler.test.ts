import * as assert from 'node:assert';
import { stripVTControlCharacters } from 'node:util';
import { suite, test } from 'mocha';
import { fake, type SinonSpy } from 'sinon';
import { Result } from 'true-myth';
import type { Packtory } from '../../packtory/packtory.ts';
import type { TerminalSpinnerRenderer } from '../spinner/terminal-spinner-renderer.ts';
import { createConfigurationLoaderStub } from '../../test-libraries/handler-stub-fixtures.ts';
import {
    runPackageDependenciesHandler,
    type PackageDependenciesHandlerDependencies
} from './package-dependencies-handler.ts';

type PackageDependenciesOutcome = Awaited<ReturnType<Packtory['inspectPackageDependencies']>>;
type PackageDependenciesHandlerFixture = {
    readonly dependencies: PackageDependenciesHandlerDependencies;
    readonly inspectPackageDependencies: SinonSpy;
    readonly log: SinonSpy;
    readonly stopAll: SinonSpy;
};

function spinnerRenderer(stopAll: SinonSpy): TerminalSpinnerRenderer {
    return { stopAll } as unknown as TerminalSpinnerRenderer;
}

function packtoryStub(
    outcome: PackageDependenciesOutcome,
    inspectPackageDependencies: SinonSpy
): Packtory {
    return {
        async inspectPackageDependencies(...commandArguments: readonly unknown[]) {
            inspectPackageDependencies(...commandArguments);
            return outcome;
        }
    } as unknown as Packtory;
}

function setup(outcome: PackageDependenciesOutcome, trace = false): PackageDependenciesHandlerFixture {
    const inspectPackageDependencies = fake();
    const log = fake();
    const stopAll = fake();
    return {
        dependencies: {
            log(message) {
                log(stripVTControlCharacters(message));
            },
            packtory: packtoryStub(outcome, inspectPackageDependencies),
            spinnerRenderer: spinnerRenderer(stopAll),
            configurationLoader: createConfigurationLoaderStub(),
            flags: { packageName: 'package-a', trace }
        },
        inspectPackageDependencies,
        log,
        stopAll
    };
}

suite('package-dependencies-handler', function () {
    test('prints dependency reasons on success', async function () {
        const { dependencies, inspectPackageDependencies, log } = setup({
            result: Result.ok({
                packageName: 'package-a',
                dependencies: [
                    {
                        name: 'react',
                        origin: 'external',
                        manifest: { type: 'emitted', group: 'dependencies', version: '^19.0.0' },
                        references: [
                            {
                                sourcePath: 'source/index.js',
                                sourceSpecifier: 'react/jsx-runtime',
                                emittedSpecifier: 'react/jsx-runtime'
                            }
                        ]
                    }
                ]
            })
        });

        const exitCode = await runPackageDependenciesHandler(dependencies);

        assert.strictEqual(exitCode, 0);
        assert.deepStrictEqual(inspectPackageDependencies.firstCall.args, [ {}, 'package-a' ]);
        assert.strictEqual(
            log.firstCall.args[0],
            [
                'Packtory dependency reasons [Dry run]',
                'package-a',
                'dependencies',
                '  react ^19.0.0 (external)',
                '    source/index.js: react/jsx-runtime'
            ]
                .join('\n')
        );
    });

    test('prints config and partial failures', async function () {
        const configurationFailure = setup({ result: Result.err({ type: 'configuration', issues: [ 'bad config' ] }) });
        const partialFailure = setup({
            result: Result.err({
                type: 'partial',
                error: {
                    succeeded: [],
                    failures: [ new Error('resolve failed') ]
                }
            })
        }, true);

        assert.strictEqual(await runPackageDependenciesHandler(configurationFailure.dependencies), 1);
        assert.strictEqual(
            configurationFailure.log.firstCall.args[0],
            'Packtory dependency reasons [Dry run]\nConfiguration issues\n- bad config'
        );

        assert.strictEqual(await runPackageDependenciesHandler(partialFailure.dependencies), 1);
        assert.match(
            String(partialFailure.log.firstCall.args[0]),
            /^Packtory dependency reasons \[Dry run\]\nPackage failures\n- resolve failed\n {2}Stack trace: Error: resolve failed/u
        );
    });

    test('returns exit code 1 when dependency inspection fails', async function () {
        const { dependencies, log } = setup({
            result: Result.err({ type: 'package-not-found', packageName: 'missing' })
        });

        const exitCode = await runPackageDependenciesHandler(dependencies);

        assert.strictEqual(exitCode, 1);
        assert.strictEqual(log.firstCall.args[0], 'Package "missing" is not declared in the packtory configuration');
    });

    test('prints fallback failures and stops spinners after success and finally', async function () {
        const fallback = setup({
            result: Result.err({ type: 'output-root-not-directory', outputPath: '/out' })
        });
        const success = setup({ result: Result.ok({ packageName: 'package-a', dependencies: [] }) });

        assert.strictEqual(await runPackageDependenciesHandler(fallback.dependencies), 1);
        assert.strictEqual(fallback.log.firstCall.args[0], 'Package dependencies could not be inspected');

        assert.strictEqual(await runPackageDependenciesHandler(success.dependencies), 0);
        assert.strictEqual(success.stopAll.callCount, 2);
    });
});
