import assert from 'node:assert';
import type { AnalyzedBundle, EliminationInput } from '../dead-code-eliminator/analyzed-bundle.ts';
import { assertValidDeadCodeEliminationOutput } from './dead-code-elimination-invariant-assertions.ts';
import { createTestEliminator } from './eliminator-fixtures.ts';
import { assertExpectedElimination } from './expected-elimination-output.ts';

export type DeadCodeEliminationEntry = {
    readonly bundleName: string;
    readonly targetFilePath: string;
    readonly exportName: string;
};
export type DeadCodeEliminationCase = {
    readonly name: string;
    readonly entry: DeadCodeEliminationEntry;
    readonly eliminationInputs: readonly EliminationInput[];
};
export type DeadCodeEliminationBehaviorComparison = {
    readonly name: string;
    readonly entry: DeadCodeEliminationEntry;
    readonly leftName: string;
    readonly leftBundles: readonly WritableBundle[];
    readonly rightName: string;
    readonly rightBundles: readonly WritableBundle[];
};
type WritableBundle = {
    readonly name: string;
    readonly roots: AnalyzedBundle['roots'];
    readonly contents: readonly {
        readonly fileDescription: {
            readonly targetFilePath: string;
            readonly content: string;
        };
    }[];
};
export type VerifiedDeadCodeElimination = {
    readonly bundles: readonly AnalyzedBundle[];
};
function entryContext(name: string, entry: DeadCodeEliminationEntry): string {
    return `${name}: ${entry.bundleName}/${entry.targetFilePath}#${entry.exportName}`;
}
function verifyEntryBundle(
    name: string,
    entry: DeadCodeEliminationEntry,
    bundles: readonly WritableBundle[],
    phase: string
): void {
    const bundle = bundles.find(function (candidate) {
        return candidate.name === entry.bundleName;
    });
    assert.notStrictEqual(bundle, undefined, `${entryContext(name, entry)} missing ${phase} entry bundle`);
    const resource = bundle?.contents.find(function (candidate) {
        return candidate.fileDescription.targetFilePath === entry.targetFilePath;
    });
    assert.notStrictEqual(resource, undefined, `${entryContext(name, entry)} missing ${phase} entry file`);
}
function originalBundles(input: DeadCodeEliminationCase): readonly WritableBundle[] {
    return input.eliminationInputs.map(function (eliminationInput) {
        return eliminationInput.bundle;
    });
}
function entryBundles(input: DeadCodeEliminationCase, bundles: readonly AnalyzedBundle[]): readonly AnalyzedBundle[] {
    return bundles.filter(function (bundle) {
        return bundle.name === input.entry.bundleName;
    });
}

export function assertDeadCodeEliminationExpectedOutput(input: DeadCodeEliminationBehaviorComparison): void {
    assertExpectedElimination(input.entry, input.leftBundles, input.rightBundles);
}
async function eliminateDeadCodeForAssertion(input: DeadCodeEliminationCase): Promise<readonly AnalyzedBundle[]> {
    const eliminated = await createTestEliminator().eliminate(input.eliminationInputs);
    verifyEntryBundle(input.name, input.entry, eliminated, 'eliminated');
    return eliminated;
}
export async function eliminateDeadCodeAndAssertAllOutputValid(
    input: DeadCodeEliminationCase
): Promise<readonly AnalyzedBundle[]> {
    const eliminated = await eliminateDeadCodeForAssertion(input);
    assertValidDeadCodeEliminationOutput(input.name, eliminated);
    return eliminated;
}
export async function assertDeadCodeEliminationOutput(
    input: DeadCodeEliminationCase
): Promise<VerifiedDeadCodeElimination> {
    const original = originalBundles(input);
    const eliminated = await eliminateDeadCodeForAssertion(input);
    assertValidDeadCodeEliminationOutput(input.name, entryBundles(input, eliminated));
    verifyEntryBundle(input.name, input.entry, original, 'original');
    assertDeadCodeEliminationExpectedOutput({
        name: input.name,
        entry: input.entry,
        leftName: 'original',
        leftBundles: original,
        rightName: 'eliminated',
        rightBundles: eliminated
    });
    return {
        bundles: eliminated
    };
}

export async function eliminateDeadCodeAndAssertExpectedOutput(
    input: DeadCodeEliminationCase
): Promise<readonly AnalyzedBundle[]> {
    const { bundles } = await assertDeadCodeEliminationOutput(input);
    assertValidDeadCodeEliminationOutput(input.name, bundles);
    return bundles;
}
