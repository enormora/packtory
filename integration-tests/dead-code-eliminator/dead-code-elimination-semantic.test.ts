import fastCheck from 'fast-check';
import { suite, test } from 'mocha';
import type { GeneratedDeadCodeEliminationProgram } from '../../source/test-libraries/dead-code-elimination-generated-programs.ts';
import {
    deadCodeEliminationSemanticArbitrary,
    deadCodeEliminationSemanticProgram
} from '../../source/test-libraries/dead-code-elimination-semantic-programs.ts';
import { inputs } from '../../source/test-libraries/eliminator-test-support.ts';
import { assertDeadCodeEliminationEquivalent } from './runtime-comparison.ts';

suite('dead code elimination generated semantics', function () {
    for (
        const scenario of [
            'object-getter',
            'invalid-heritage',
            'dynamic-namespace'
        ] as const
    ) {
        for (const declarations of [ true ]) {
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
                        numRuns: 1,
                        seed: 20_261_107,
                        examples: [ true ].map(function (singleLine): [GeneratedDeadCodeEliminationProgram] {
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
