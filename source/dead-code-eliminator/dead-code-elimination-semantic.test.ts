import assert from 'node:assert';
import { suite, test } from 'mocha';
import {
    assertDeadCodeEliminationEquivalent,
    eliminateDeadCodeAndAssertAllOutputValid
} from '../test-libraries/dead-code-elimination-oracle-test-support.ts';
import {
    deadCodeEliminationSemanticProgram,
    deadCodeEliminationSemanticScenarios,
    type DeadCodeEliminationSemanticScenario
} from '../test-libraries/dead-code-elimination-semantic-programs.ts';
import { inputs } from '../test-libraries/eliminator-test-support.ts';

suite('dead code elimination semantic regressions', function () {
    for (const scenario of Object.keys(deadCodeEliminationSemanticScenarios) as DeadCodeEliminationSemanticScenario[]) {
        for (const declarations of [ false, true ]) {
            for (const singleLine of [ false, true ]) {
                test(
                    `preserves ${scenario}, declarations ${String(declarations)}, single line ${String(singleLine)}`,
                    async function () {
                        const program = deadCodeEliminationSemanticProgram({
                            scenario,
                            value: 7,
                            declarations,
                            singleLine,
                            sourceSkew: false
                        });
                        await assertDeadCodeEliminationEquivalent({
                            name: program.name,
                            entry: program.entry,
                            eliminationInputs: inputs(program.bundle)
                        });
                    }
                );
            }
        }
    }

    for (const singleLine of [ false, true ]) {
        test(`removes pure declarations beside effects, single line ${String(singleLine)}`, async function () {
            const program = deadCodeEliminationSemanticProgram({
                scenario: 'object-getter',
                value: 7,
                declarations: false,
                singleLine,
                sourceSkew: false
            });
            const result = await eliminateDeadCodeAndAssertAllOutputValid({
                name: program.name,
                entry: program.entry,
                eliminationInputs: inputs(program.bundle)
            });
            assert.strictEqual(
                result
                    .flatMap(function (bundle) {
                        return bundle.contents;
                    })
                    .some(function (resource) {
                        return resource.fileDescription.content.includes('independentConstant');
                    }),
                false
            );
        });
    }
});
