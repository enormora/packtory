import fc from 'fast-check';
import { suite, test } from 'mocha';
import { assertDeadCodeEliminationEquivalent } from '../test-libraries/dead-code-elimination-oracle-test-support.ts';
import {
    deadCodeEliminationBroadProgramArbitrary,
    deadCodeEliminationCoreCaseKinds,
    deadCodeEliminationCoreProgramArbitraryFor,
    type GeneratedDeadCodeEliminationProgram
} from '../test-libraries/dead-code-elimination-program-generator.ts';
import { inputs } from '../test-libraries/eliminator-test-support.ts';

const coreRunsPerCaseKind = 17;
const broadRuns = 25;

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
            test(`preserves behavior for generated ${kind} cases`, async function () {
                await fc.assert(
                    fc.asyncProperty(deadCodeEliminationCoreProgramArbitraryFor(kind), async function (program) {
                        await assertEquivalent(program);
                    }),
                    { numRuns: coreRunsPerCaseKind }
                );
            });
        }
    });

    test('preserves behavior for generated broad module graphs', async function () {
        await fc.assert(
            fc.asyncProperty(deadCodeEliminationBroadProgramArbitrary, async function (program) {
                await assertEquivalent(program);
            }),
            { numRuns: broadRuns }
        );
    });
});
