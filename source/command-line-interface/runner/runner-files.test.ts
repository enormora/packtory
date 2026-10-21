import assert from 'node:assert';
import { stripVTControlCharacters } from 'node:util';
import { suite, test } from 'mocha';
import { fake } from 'sinon';
import { Result } from 'true-myth';
import type { PackageFileInspectionOutcome } from '../../packtory/packtory.ts';
import { createRunner, expectSubcommandHelp } from '../../test-libraries/runner-test-support.ts';

async function runInspection(outcome: PackageFileInspectionOutcome, trace: boolean): Promise<{
    readonly exitCode: number;
    readonly output: string;
}> {
    const log = fake();
    const runner = createRunner({ inspectPackageFiles: fake.resolves(outcome), log });
    const commandArguments = [ 'node', 'packtory', 'inspect', 'files', 'example' ];
    const exitCode = await runner.run(
        trace ? [ 'node', 'packtory', '--trace', ...commandArguments.slice(2) ] : commandArguments
    );
    return { exitCode, output: stripVTControlCharacters(String(log.firstCall.args[0])) };
}

suite('inspect files command', function () {
    test('loads config, selects the package, renders output, and stops spinners', async function () {
        const inspectPackageFiles = fake.resolves({ result: Result.ok({ packageName: 'example', files: [] }) });
        const loadConfiguration = fake.resolves('configuration');
        const stopAll = fake();
        const log = fake();
        const runner = createRunner({ inspectPackageFiles, loadConfiguration, log, spinnerRenderer: { stopAll } });
        assert.strictEqual(await runner.run([ 'node', 'packtory', 'inspect', 'files', 'example' ]), 0);
        assert.deepStrictEqual(inspectPackageFiles.firstCall.args, [ 'configuration', 'example' ]);
        assert.strictEqual(loadConfiguration.callCount, 1);
        assert.ok(stopAll.called);
        assert.strictEqual(
            log.firstCall.args[0],
            [
                'Packtory files [Dry run]',
                'example',
                'Source discovery before dead-code elimination; not a symbol retention explanation.',
                'No retained files.'
            ]
                .join('\n')
        );
    });

    test('prints configuration and unknown-package failures with nonzero exit codes', async function () {
        assert.deepStrictEqual(
            await runInspection({
                result: Result.err({
                    type: 'configuration',
                    issues: [ 'bad config' ]
                })
            }, false),
            {
                exitCode: 1,
                output: 'Packtory files [Dry run]\nConfiguration issues\n- bad config'
            }
        );
        assert.deepStrictEqual(
            await runInspection({
                result: Result.err({
                    type: 'package-not-found',
                    packageName: 'missing'
                })
            }, false),
            {
                exitCode: 1,
                output: 'Package "missing" is not declared in the packtory configuration'
            }
        );
        assert.deepStrictEqual(
            await runInspection({
                result: Result.err({
                    type: 'unsafe-output-folder',
                    packageName: 'example',
                    outputPath: 'dist'
                })
            }, false),
            { exitCode: 1, output: 'Package files could not be inspected' }
        );
    });

    test('honors trace for package-resolution failures', async function () {
        const outcome: PackageFileInspectionOutcome = {
            result: Result.err({
                type: 'partial',
                error: { succeeded: [], failures: [ new Error('cannot resolve') ] }
            })
        };
        assert.deepStrictEqual(await runInspection(outcome, false), {
            exitCode: 1,
            output: 'Packtory files [Dry run]\nPackage failures\n- cannot resolve'
        });
        const traced = await runInspection(outcome, true);
        assert.strictEqual(traced.exitCode, 1);
        assert.match(traced.output, /cannot resolve\n {2}Stack trace: Error: cannot resolve/u);
    });

    test('prints help without loading config', async function () {
        const help = await expectSubcommandHelp('inspect', 'files');
        assert.match(help, /packtory inspect files/u);
        assert.match(help, /<package>/u);
        assert.match(help, /Prints source discovery chains for retained files in one package\./u);
    });

    test('stops spinners when inspection throws', async function () {
        const stopAll = fake();
        const inspectPackageFiles = fake.rejects(new Error('inspection failed'));
        const runner = createRunner({ inspectPackageFiles, spinnerRenderer: { stopAll } });
        assert.strictEqual(await runner.run([ 'node', 'packtory', 'inspect', 'files', 'example' ]), 1);
        assert.ok(stopAll.called);
    });
});
