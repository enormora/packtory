import assert from 'node:assert';
import fc from 'fast-check';
import { suite, test } from 'mocha';
import {
    assertDeadCodeEliminationBehaviorEquivalent,
    assertDeadCodeEliminationEquivalent,
    assertDeadCodeEliminationIdempotent,
    eliminateDeadCodeAndAssertAllOutputValid
} from '../test-libraries/dead-code-elimination-oracle-test-support.ts';
import {
    deadCodeEliminationSourceTargetSkewProgramArbitrary,
    deadCodeEliminationSourceTargetSkewRegression
} from '../test-libraries/dead-code-elimination-source-target-skew-programs.ts';
import type { GeneratedDeadCodeEliminationProgram } from '../test-libraries/dead-code-elimination-generated-programs.ts';
import { inputs } from '../test-libraries/eliminator-test-support.ts';

const sourceTargetSkewRuns = 25;
const sourceTargetSkewChunks = 5;
const sourceTargetSkewRunsPerChunk = sourceTargetSkewRuns / sourceTargetSkewChunks;

function sourceTargetSkewFailure(program: GeneratedDeadCodeEliminationProgram, error: unknown): Error {
    const message = error instanceof Error ? error.message : String(error);
    return new Error(`${program.name} changed behavior\n\n${program.fileListing}\n\n${message}`, {
        cause: error
    });
}

async function assertEquivalentAndIdempotent(program: GeneratedDeadCodeEliminationProgram): Promise<void> {
    try {
        await assertDeadCodeEliminationEquivalent({
            name: program.name,
            entry: program.entry,
            eliminationInputs: inputs(program.bundle)
        });
        await assertDeadCodeEliminationIdempotent({
            name: program.name,
            entry: program.entry,
            eliminationInputs: inputs(program.bundle)
        });
    } catch (error: unknown) {
        throw sourceTargetSkewFailure(program, error);
    }
}

async function assertRegressionShape(program: GeneratedDeadCodeEliminationProgram): Promise<void> {
    const eliminated = await eliminateDeadCodeAndAssertAllOutputValid({
        name: program.name,
        entry: program.entry,
        eliminationInputs: inputs(program.bundle)
    });
    const [ bundle ] = eliminated;
    const runtimeContents = bundle
        ?.contents
        .map(function (resource) {
            return resource.fileDescription.content;
        })
        .join('\n') ?? '';

    assert.strictEqual(runtimeContents.includes('modelValue'), true);
    assert.strictEqual(runtimeContents.includes('unusedModelValue'), false);
    await assertDeadCodeEliminationBehaviorEquivalent({
        name: program.name,
        entry: program.entry,
        leftName: 'original',
        leftBundles: [ program.bundle ],
        rightName: 'eliminated',
        rightBundles: eliminated
    });
    await assertDeadCodeEliminationIdempotent({
        name: program.name,
        entry: program.entry,
        eliminationInputs: inputs(program.bundle)
    });
}

suite('dead code elimination source and target skew', function () {
    test('preserves behavior for a deterministic source and target skew regression', async function () {
        const program = deadCodeEliminationSourceTargetSkewRegression();
        try {
            await assertRegressionShape(program);
        } catch (error: unknown) {
            throw sourceTargetSkewFailure(program, error);
        }
    });

    for (let chunk = 0; chunk < sourceTargetSkewChunks; chunk += 1) {
        test(`preserves behavior for generated source and target skew cases, chunk ${chunk + 1}`, async function () {
            await fc.assert(
                fc.asyncProperty(deadCodeEliminationSourceTargetSkewProgramArbitrary, async function (program) {
                    await assertEquivalentAndIdempotent(program);
                }),
                { numRuns: sourceTargetSkewRunsPerChunk }
            );
        });
    }
});
