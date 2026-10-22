import assert from 'node:assert';
import { stripVTControlCharacters } from 'node:util';
import { suite, test } from 'mocha';
import { fake } from 'sinon';
import { Result } from 'true-myth';
import type { PackageFileInspection, PackageSymbolInspection } from '../../packtory/packtory.ts';
import type { PackageInspectionFailure } from '../../packtory/packtory-results.ts';
import { createRunner, expectSubcommandHelp } from '../../test-libraries/runner-test-support.ts';

type InspectionScenario = {
    readonly command: string;
    readonly method: 'inspectPackageFiles' | 'inspectPackageSymbols';
    readonly title: string;
    readonly empty: PackageFileInspection | PackageSymbolInspection;
    readonly summary: string;
    readonly emptyMessage: string;
    readonly description: RegExp;
    readonly fallback: string;
};

const scenarios: readonly InspectionScenario[] = [ {
    command: 'files',
    method: 'inspectPackageFiles',
    title: 'Packtory files [Dry run]',
    empty: { packageName: 'example', files: [] },
    summary: 'Source discovery before dead-code elimination; not a symbol retention explanation.',
    emptyMessage: 'No retained files.',
    description: /Prints source discovery chains for retained files in one package\./u,
    fallback: 'Package files could not be inspected'
}, {
    command: 'symbols',
    method: 'inspectPackageSymbols',
    title: 'Packtory symbols [Dry run]',
    empty: { packageName: 'example', symbols: [] },
    summary: 'Top-level bindings in linked package sources; locations refer to code before dead-code elimination.',
    emptyMessage: 'No top-level symbols.',
    description: /Prints why top-level symbols are kept or removed in one package\./u,
    fallback: 'Package symbols could not be inspected'
} ];

async function runFailure(
    scenario: InspectionScenario,
    failure: PackageInspectionFailure,
    trace: boolean
): Promise<{
    readonly exitCode: number;
    readonly output: string;
}> {
    const log = fake();
    const runner = createRunner({ [scenario.method]: fake.resolves({ result: Result.err(failure) }), log });
    const commandArguments = [ 'inspect', scenario.command, 'example' ];
    const exitCode = await runner.run([ 'node', 'packtory', ...trace ? [ '--trace' ] : [], ...commandArguments ]);
    return { exitCode, output: stripVTControlCharacters(String(log.firstCall.args[0])) };
}

for (const scenario of scenarios) {
    suite(`inspect ${scenario.command} command`, function () {
        test('loads config, selects the package, renders output, and stops spinners', async function () {
            const inspect = fake.resolves({ result: Result.ok(scenario.empty) });
            const loadConfiguration = fake.resolves('configuration');
            const stopAll = fake();
            const log = fake();
            const runner = createRunner({
                [scenario.method]: inspect,
                loadConfiguration,
                log,
                spinnerRenderer: { stopAll }
            });
            assert.strictEqual(await runner.run([ 'node', 'packtory', 'inspect', scenario.command, 'example' ]), 0);
            assert.deepStrictEqual(inspect.firstCall.args, [ 'configuration', 'example' ]);
            assert.strictEqual(loadConfiguration.callCount, 1);
            assert.ok(stopAll.called);
            assert.strictEqual(
                log.firstCall.args[0],
                [ scenario.title, 'example', scenario.summary, scenario.emptyMessage ].join('\n')
            );
        });

        test('prints configuration, unknown-package, and other failures', async function () {
            const cases: readonly { readonly failure: PackageInspectionFailure; readonly output: string; }[] = [ {
                failure: { type: 'configuration', issues: [ 'bad config' ] },
                output: `${scenario.title}\nConfiguration issues\n- bad config`
            }, {
                failure: { type: 'package-not-found', packageName: 'missing' },
                output: 'Package "missing" is not declared in the packtory configuration'
            }, {
                failure: { type: 'unsafe-output-folder', packageName: 'example', outputPath: 'dist' },
                output: scenario.fallback
            } ];
            for (const entry of cases) {
                assert.deepStrictEqual(await runFailure(scenario, entry.failure, false), {
                    exitCode: 1,
                    output: entry.output
                });
            }
        });

        test('honors trace for package-resolution failures', async function () {
            const failure: PackageInspectionFailure = {
                type: 'partial',
                error: { succeeded: [], failures: [ new Error('cannot resolve') ] }
            };
            assert.deepStrictEqual(await runFailure(scenario, failure, false), {
                exitCode: 1,
                output: `${scenario.title}\nPackage failures\n- cannot resolve`
            });
            const traced = await runFailure(scenario, failure, true);
            assert.strictEqual(traced.exitCode, 1);
            assert.match(traced.output, /cannot resolve\n {2}Stack trace: Error: cannot resolve/u);
        });

        test('prints help without loading config', async function () {
            const help = await expectSubcommandHelp('inspect', scenario.command);
            assert.ok(help.includes(`packtory inspect ${scenario.command}`));
            assert.match(help, /<package>/u);
            assert.match(help, scenario.description);
        });

        test('stops spinners when inspection throws', async function () {
            const stopAll = fake();
            const runner = createRunner({
                [scenario.method]: fake.rejects(new Error('inspection failed')),
                spinnerRenderer: { stopAll }
            });
            assert.strictEqual(await runner.run([ 'node', 'packtory', 'inspect', scenario.command, 'example' ]), 1);
            assert.ok(stopAll.called);
        });
    });
}
