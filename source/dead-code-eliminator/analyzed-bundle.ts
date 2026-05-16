import type { Except } from 'type-fest';
import type { DeadCodeEliminationSettings } from '../config/dead-code-elimination-settings.ts';
import type { LinkedBundle, LinkedBundleResource } from '../linker/linked-bundle.ts';

export type SideEffectStatement = {
    readonly line: number;
    readonly kind: string;
};

export type FileAnalysis = {
    readonly survivingBindings: ReadonlySet<string>;
    readonly sideEffectStatements: readonly SideEffectStatement[];
    readonly sideEffectImports: ReadonlySet<string>;
};

export type AnalyzedBundleResource = LinkedBundleResource & {
    readonly analysis: FileAnalysis;
};

export type AnalyzedBundle = Except<LinkedBundle, 'contents'> & {
    readonly contents: readonly AnalyzedBundleResource[];
    readonly sideEffectsField: readonly string[] | false | undefined;
};

export type EliminationInput = {
    readonly bundle: LinkedBundle;
    readonly transformationsEnabled: boolean;
    readonly deadCodeElimination?: DeadCodeEliminationSettings | undefined;
};

export type DeadCodeEliminator = {
    eliminate: (inputs: readonly EliminationInput[]) => Promise<readonly AnalyzedBundle[]>;
};

export function createEmptyFileAnalysis(): FileAnalysis {
    return {
        survivingBindings: new Set<string>(),
        sideEffectStatements: [],
        sideEffectImports: new Set<string>()
    };
}
