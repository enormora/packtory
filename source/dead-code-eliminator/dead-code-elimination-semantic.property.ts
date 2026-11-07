import fastCheck from 'fast-check';
import { suite, test } from 'mocha';
import type { GeneratedDeadCodeEliminationProgram } from '../test-libraries/dead-code-elimination-generated-programs.ts';
import { assertDeadCodeEliminationEquivalent } from '../test-libraries/dead-code-elimination-oracle-test-support.ts';
import {
    deadCodeEliminationSemanticArbitrary,
    deadCodeEliminationSemanticProgram,
    deadCodeEliminationSemanticScenarios,
    type DeadCodeEliminationSemanticScenario
} from '../test-libraries/dead-code-elimination-semantic-programs.ts';
import { inputs } from '../test-libraries/eliminator-test-support.ts';

suite('dead code elimination generated semantics', function () {
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
                    {
                        numRuns: 5,
                        seed: 20_261_107,
                        examples: [ false, true ].map(function (singleLine): [GeneratedDeadCodeEliminationProgram] {
                            return [ deadCodeEliminationSemanticProgram({
                                scenario,
                                value: 7,
                                declarations,
                                singleLine,
                                sourceSkew: false
                            }) ];
                        })
                    }
                );
            });
        }
    }
});
