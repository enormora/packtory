import assert from 'node:assert';
import fastCheck from 'fast-check';
import { suite, test } from 'mocha';
import {
    observeDeadCodeEliminationBehavior,
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
const transformChunks = runsPerTransform;
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

type ProgramBehavior = {
    readonly original: Awaited<ReturnType<typeof observeDeadCodeEliminationBehavior>>;
    readonly eliminated: Awaited<ReturnType<typeof observeDeadCodeEliminationBehavior>>;
};

async function observeProgramBehavior(
    program: GeneratedDeadCodeEliminationMetamorphicCase['original']
): Promise<ProgramBehavior> {
    const original = await observeDeadCodeEliminationBehavior({
        name: program.name,
        entry: program.entry,
        bundles: program.bundles
    });
    const eliminated = await eliminateDeadCodeAndAssertAllOutputValid({
        name: program.name,
        entry: program.entry,
        eliminationInputs: inputs(...program.bundles)
    });
    return {
        original,
        eliminated: await observeDeadCodeEliminationBehavior({
            name: program.name,
            entry: program.entry,
            bundles: eliminated
        })
    };
}

async function assertMetamorphicEquivalent(input: GeneratedDeadCodeEliminationMetamorphicCase): Promise<void> {
    try {
        const original = await observeProgramBehavior(input.original);
        const transformed = await observeProgramBehavior(input.transformed);
        assert.deepStrictEqual(transformed.original, original.original, 'metamorphic inputs differ');
        assert.deepStrictEqual(original.eliminated, original.original, 'original input changed after DCE');
        assert.deepStrictEqual(transformed.eliminated, transformed.original, 'transformed input changed after DCE');
        assert.deepStrictEqual(transformed.eliminated, original.eliminated, 'optimized outputs differ');
        await assertIdempotenceWhenNeeded(input);
    } catch (error: unknown) {
        throw formatCaseFailure(input, error);
    }
}

suite('dead code elimination metamorphic equivalence', function () {
    this.timeout(60_000);

    test('preserves behavior for a declaration companion runtime chain regression', async function () {
        await assertMetamorphicEquivalent(generatedDeclarationCompanionMetamorphicRegression());
    });

    for (const kind of deadCodeEliminationMetamorphicTransformKinds) {
        for (let chunk = 0; chunk < transformChunks; chunk += 1) {
            test(`preserves behavior for generated ${kind} transforms, chunk ${chunk + 1}`, async function () {
                await fastCheck.assert(
                    fastCheck.asyncProperty(
                        deadCodeEliminationMetamorphicProgramArbitraryFor(kind),
                        async function (input) {
                            await assertMetamorphicEquivalent(input);
                        }
                    ),
                    { numRuns: runsPerTransformChunk }
                );
            });
        }
    }
});
