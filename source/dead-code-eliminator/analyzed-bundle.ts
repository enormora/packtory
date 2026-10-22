import type { Except } from 'type-fest';
import type { DeadCodeEliminationSettings } from '../configuration/dead-code-elimination-settings.ts';
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
    readonly substitutionPublicModuleInputFilePaths: ReadonlySet<string>;
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

type SymbolRetentionStep = {
    readonly binding: string;
    readonly reason: string;
    readonly consumerPackage: string | undefined;
};

export type InspectedSymbol = {
    readonly packagePath: string;
    readonly name: string;
    readonly line: number;
    readonly kind: string;
    readonly decision: 'kept' | 'removed';
    readonly reason: 'dead-code-elimination-disabled' | 'reachable' | 'unreachable';
    readonly chain: readonly SymbolRetentionStep[];
};

export type BundleSymbolInspection = {
    readonly bundle: AnalyzedBundle;
    readonly symbols: readonly InspectedSymbol[];
};

export type SymbolEliminationInspector = (
    inputs: readonly EliminationInput[]
) => Promise<readonly BundleSymbolInspection[]>;
