import fastCheck from 'fast-check';
import { suite, test } from 'mocha';
import { assertDeadCodeEliminationEquivalent } from '../test-libraries/dead-code-elimination-oracle-test-support.ts';
import {
    deadCodeEliminationSemanticArbitrary,
    deadCodeEliminationSemanticScenarios,
    type DeadCodeEliminationSemanticScenario
} from '../test-libraries/dead-code-elimination-semantic-programs.ts';
import { inputs } from '../test-libraries/eliminator-test-support.ts';

suite('dead code elimination generated semantics', function () {
    this.timeout(30_000);

    for (const scenario of Object.keys(deadCodeEliminationSemanticScenarios) as DeadCodeEliminationSemanticScenario[]) {
        for (const declarations of [ false, true ]) {
            test(`preserves ${scenario}, declarations ${String(declarations)}`, async function () {
                await fastCheck.assert(
                    fastCheck.asyncProperty(
                        deadCodeEliminationSemanticArbitrary(scenario, declarations),
                        async function (program) {
                            await assertDeadCodeEliminationEquivalent({
                                name: `${program.name}\n${program.fileListing}`,
                                entry: program.entry,
                                eliminationInputs: inputs(program.bundle)
                            });
                        }
                    ),
                    { numRuns: 3, seed: 20_261_107 }
                );
            });
        }
    }
});
