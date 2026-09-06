import fc from 'fast-check';
import { suite, test } from 'mocha';
import {
    assertDeadCodeEliminationBehaviorEquivalent,
    assertDeadCodeEliminationIdempotent,
    eliminateDeadCodeAndAssertAllOutputValid
} from '../test-libraries/dead-code-elimination-oracle-test-support.ts';
import {
    deadCodeEliminationMetamorphicProgramArbitraryFor,
    generatedDeclarationCompanionMetamorphicRegression
} from '../test-libraries/dead-code-elimination-metamorphic-programs.ts';
import {
    deadCodeEliminationMetamorphicTransformKinds,
    type GeneratedDeadCodeEliminationMetamorphicCase
} from '../test-libraries/dead-code-elimination-metamorphic-types.ts';
import { inputs } from '../test-libraries/eliminator-test-support.ts';

const runsPerTransform = 25;
const transformChunks = 5;
const runsPerTransformChunk = runsPerTransform / transformChunks;

function formatCaseFailure(input: GeneratedDeadCodeEliminationMetamorphicCase, error: unknown): Error {
    const message = error instanceof Error ? error.message : String(error);
    return new Error(
        [
            `${input.name} failed for ${input.transformKind}`,
            '',
            'Original:',
            input.original.fileListing,
            '',
            'Transformed:',
            input.transformed.fileListing,
            '',
            message
        ]
            .join('\n'),
        { cause: error }
    );
}

async function assertIdempotenceWhenNeeded(input: GeneratedDeadCodeEliminationMetamorphicCase): Promise<void> {
    if (input.transformKind === 'eliminate-twice') {
        await assertDeadCodeEliminationIdempotent({
            name: input.name,
            entry: input.original.entry,
            eliminationInputs: inputs(...input.original.bundles)
        });
    }
}

async function assertMetamorphicEquivalent(input: GeneratedDeadCodeEliminationMetamorphicCase): Promise<void> {
    try {
        await assertDeadCodeEliminationBehaviorEquivalent({
            name: input.name,
            entry: input.original.entry,
            leftName: 'original input',
            leftBundles: input.original.bundles,
            rightName: 'transformed input',
            rightBundles: input.transformed.bundles
        });

        const originalEliminated = await eliminateDeadCodeAndAssertAllOutputValid({
            name: `${input.name} original`,
            entry: input.original.entry,
            eliminationInputs: inputs(...input.original.bundles)
        });
        const transformedEliminated = await eliminateDeadCodeAndAssertAllOutputValid({
            name: `${input.name} transformed`,
            entry: input.transformed.entry,
            eliminationInputs: inputs(...input.transformed.bundles)
        });

        await assertDeadCodeEliminationBehaviorEquivalent({
            name: input.name,
            entry: input.original.entry,
            leftName: 'eliminated original input',
            leftBundles: originalEliminated,
            rightName: 'eliminated transformed input',
            rightBundles: transformedEliminated
        });
        await assertIdempotenceWhenNeeded(input);
    } catch (error: unknown) {
        throw formatCaseFailure(input, error);
    }
}

suite('dead code elimination metamorphic equivalence', function () {
    test('preserves behavior for a declaration companion runtime chain regression', async function () {
        await assertMetamorphicEquivalent(generatedDeclarationCompanionMetamorphicRegression());
    });

    for (const kind of deadCodeEliminationMetamorphicTransformKinds) {
        for (let chunk = 0; chunk < transformChunks; chunk += 1) {
            test(`preserves behavior for generated ${kind} transforms, chunk ${chunk + 1}`, async function () {
                await fc.assert(
                    fc.asyncProperty(deadCodeEliminationMetamorphicProgramArbitraryFor(kind), async function (input) {
                        await assertMetamorphicEquivalent(input);
                    }),
                    { numRuns: runsPerTransformChunk }
                );
            });
        }
    }
});
