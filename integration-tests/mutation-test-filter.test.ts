import assert from 'node:assert';
import { suite, test } from 'mocha';
import { Stryker } from '@stryker-mutator/core';
import { z } from 'zod/mini';
import { runNodeProbe } from '../source/test-libraries/run-node-probe.ts';

suite('mutation test filtering', function () {
    test('selects transitive importers for module-load mutants', async function () {
        const result = await runNodeProbe(
            `
            import path from 'node:path';
            process.argv = [process.execPath, 'prepare-mutation-test-plan',
                'integration-tests/fixtures/mutation-test-filter/mocha.static.json',
                'target/static-filter-test-plan.json'];
            await import('./source/test-libraries/prepare-mutation-test-plan.entry-point.ts');
            process.env.PACKTORY_MUTATION_TEST_PLAN = path.resolve('target/static-filter-test-plan.json');
            const { Stryker } = await import('@stryker-mutator/core');
            const stryker = new Stryker({
                configFile: 'integration-tests/fixtures/mutation-test-filter/stryker.static.json'
            });
            console.log(JSON.stringify(await stryker.runMutationTest()));
        `,
            { timeoutMilliseconds: 120_000 }
        );
        const mutants = z.parse(z.array(z.unknown()), result);
        assert.notStrictEqual(mutants.length, 0);
        for (const mutant of mutants) {
            assert.partialDeepStrictEqual(mutant, {
                status: 'Killed',
                killedBy: [ 'static filtering observes a reexported value' ]
            });
        }
    });

    for (const disableBail of [ false, true ]) {
        test(`selects literal and multiline names with disableBail=${disableBail}`, async function () {
            const stryker = new Stryker({
                configFile: 'integration-tests/fixtures/mutation-test-filter/stryker.config.json',
                disableBail
            });
            const results = await stryker.runMutationTest();
            for (
                const [ file, titles ] of [
                    [
                        'literal-value.ts',
                        [ 'filtering literal [value]+ (result)? ^$|.*', 'filtering repeated literal' ]
                    ],
                    [ 'multiline-value.ts', [ 'filtering nested multiline\nname' ] ]
                ] as const
            ) {
                const mutants = results.filter(function (mutant) {
                    return mutant.fileName.endsWith(`/${file}`);
                });
                assert.notStrictEqual(mutants.length, 0);
                for (const mutant of mutants) {
                    assert.deepStrictEqual(
                        { status: mutant.status, killedBy: mutant.killedBy },
                        { status: 'Killed', killedBy: disableBail ? titles : titles.slice(0, 1) }
                    );
                }
            }
        });
    }
});
