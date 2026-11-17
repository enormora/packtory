import fastCheck from 'fast-check';
import { suite, test } from 'mocha';
import type { GeneratedDeadCodeEliminationProgram } from '../../source/test-libraries/dead-code-elimination-generated-programs.ts';
import {
    deadCodeEliminationBroadProgramArbitrary,
    deadCodeEliminationCoreCaseKinds,
    deadCodeEliminationCoreProgramArbitraryFor
} from '../../source/test-libraries/dead-code-elimination-program-generator.ts';
import { inputs } from '../../source/test-libraries/eliminator-test-support.ts';
import { assertDeadCodeEliminationEquivalent } from './runtime-comparison.ts';

const coreRunsPerCaseKind = 1;
const broadRuns = Array.from({
    length: 5
}, function (_unused, index) {
    return index + 1;
});
async function assertEquivalent(program: GeneratedDeadCodeEliminationProgram): Promise<void> {
    try {
        await assertDeadCodeEliminationEquivalent({
            name: program.name,
            entry: program.entry,
            eliminationInputs: inputs(program.bundle)
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`${program.name} changed behavior\n\n${program.fileListing}\n\n${message}`, {
            cause: error
        });
    }
}

suite('dead code elimination equivalence', function () {
    suite('core module graphs', function () {
        for (const kind of deadCodeEliminationCoreCaseKinds) {
            for (let run = 0; run < coreRunsPerCaseKind; run += 1) {
                test(`preserves behavior for generated ${kind} cases, run ${run + 1}`, async function () {
                    await fastCheck.assert(
                        fastCheck.asyncProperty(
                            deadCodeEliminationCoreProgramArbitraryFor(kind),
                            async function (program) {
                                await assertEquivalent(program);
                            }
                        ),
                        {
                            numRuns: 1
                        }
                    );
                });
            }
        }
    });
    for (const run of broadRuns) {
        test(`preserves behavior for generated broad module graphs, run ${run}`, async function () {
            await fastCheck.assert(
                fastCheck.asyncProperty(deadCodeEliminationBroadProgramArbitrary, async function (program) {
                    await assertEquivalent(program);
                }),
                {
                    numRuns: 1
                }
            );
        });
    }
});
