import assert from 'node:assert';
import { suite, test } from 'mocha';
import { Stryker } from '@stryker-mutator/core';

suite('mutation test filtering', function () {
    for (const disableBail of [ false, true ]) {
        test(`selects literal and multiline names with disableBail=${disableBail}`, async function () {
            const stryker = new Stryker({
                configFile: 'integration-tests/fixtures/mutation-test-filter/stryker.config.json',
                disableBail
            });
            const results = await stryker.runMutationTest();
            for (
                const [ file, titles ] of [
                    [ 'literal-value.ts', [ 'filtering literal [value]+ (result)? ^$|.*', 'filtering repeated literal' ] ],
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
