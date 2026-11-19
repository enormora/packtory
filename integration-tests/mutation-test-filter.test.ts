import assert from 'node:assert';
import { suite, test } from 'mocha';
import { Stryker } from '@stryker-mutator/core';

suite('mutation test filtering', function () {
    test('selects literal and multiline names without running uncovered tests', async function () {
        const stryker = new Stryker({
            configFile: 'integration-tests/fixtures/mutation-test-filter/stryker.config.json'
        });
        const results = await stryker.runMutationTest();
        for (
            const [ file, title ] of [
                [ 'literal-value.ts', 'filtering literal [value]+ (result)? ^$|.*' ],
                [ 'multiline-value.ts', 'filtering multiline\nname' ]
            ] as const
        ) {
            const mutants = results.filter(function (mutant) {
                return mutant.fileName.endsWith(`/${file}`);
            });
            assert.notStrictEqual(mutants.length, 0);
            for (const mutant of mutants) {
                assert.deepStrictEqual(
                    { status: mutant.status, killedBy: mutant.killedBy },
                    { status: 'Killed', killedBy: [ title ] }
                );
            }
        }
    });
});
