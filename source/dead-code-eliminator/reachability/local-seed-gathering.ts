import { Node as TypeScriptMorphNode, type SourceFile, type Statement } from 'ts-morph';
import type { SideEffectClassifier } from '../side-effect-classifier.ts';
import type { DeadCodeEliminationSettings } from '../../configuration/dead-code-elimination-settings.ts';
import type { DeadCodeEliminationTrace, LocalSeedReason } from '../trace.ts';
import { bindingIdentifier, type FileBindingSet } from './binding-identifier.ts';
import { collectIdentifierTargets, type DeclarationNodeIndex } from './identifier-target-collector.ts';
import { collectImpureStatements } from './impure-statements.ts';

export type FileBindings = FileBindingSet & {
    readonly sourceFile: Readonly<SourceFile>;
};

type LocalSeed = {
    readonly bindingIdentifier: string;
    readonly inputFilePath: string;
    readonly line: number;
    readonly reason: LocalSeedReason;
};

type SeedCollectionContext = {
    readonly declarationIndex: DeclarationNodeIndex;
    readonly classifySideEffects: SideEffectClassifier;
    readonly deadCodeElimination: DeadCodeEliminationSettings | undefined;
    readonly trace: DeadCodeEliminationTrace;
};

export type LocalSeedGatheringInput = {
    readonly files: readonly FileBindings[];
    readonly entryPointFilePaths: ReadonlySet<string>;
    readonly declarationIndex: DeclarationNodeIndex;
    readonly classifySideEffects: SideEffectClassifier;
    readonly deadCodeElimination: DeadCodeEliminationSettings | undefined;
    readonly bundleName: string;
    readonly trace: DeadCodeEliminationTrace;
};

function statementSeeds(
    file: FileBindings,
    statements: readonly Statement[],
    declarationIndex: DeclarationNodeIndex,
    reason: LocalSeedReason
): readonly LocalSeed[] {
    return statements.flatMap(function (statement) {
        return Array.from(collectIdentifierTargets(statement, declarationIndex), function (seed) {
            return {
                bindingIdentifier: seed,
                inputFilePath: file.inputFilePath,
                line: statement.getStartLineNumber(),
                reason
            };
        });
    });
}

function entryPointExportDeclarationSeeds(
    file: FileBindings,
    declarationIndex: DeclarationNodeIndex
): readonly LocalSeed[] {
    return file.sourceFile.getStatements().flatMap(function (statement) {
        return TypeScriptMorphNode.isExportDeclaration(statement)
            ? statementSeeds(file, [ statement ], declarationIndex, 'entry-export-declaration')
            : [];
    });
}

function bindingLine(binding: FileBindings['bindings'][number], trace: DeadCodeEliminationTrace): number {
    if (trace === undefined) {
        return 0;
    }
    return binding.statement.getStartLineNumber();
}

function exportedBindingSeeds(
    file: FileBindings,
    isEntry: boolean,
    trace: DeadCodeEliminationTrace
): readonly LocalSeed[] {
    if (!isEntry) {
        return [];
    }
    return file.bindings.flatMap(function (binding) {
        return binding.isExported
            ? [
                {
                    bindingIdentifier: bindingIdentifier(file.targetFilePath, binding.name),
                    inputFilePath: file.inputFilePath,
                    line: bindingLine(binding, trace),
                    reason: 'entry-export'
                }
            ]
            : [];
    });
}

function seedsForFile(
    file: FileBindings,
    isEntry: boolean,
    context: SeedCollectionContext
): readonly LocalSeed[] {
    const impureStatements = collectImpureStatements(
        file.sourceFile,
        context.deadCodeElimination,
        context.classifySideEffects
    );
    return [
        ...exportedBindingSeeds(file, isEntry, context.trace),
        ...isEntry ? entryPointExportDeclarationSeeds(file, context.declarationIndex) : [],
        ...statementSeeds(file, impureStatements, context.declarationIndex, 'impure-statement')
    ];
}

type AddSeedInput = {
    readonly seeds: ReadonlySet<string>;
    readonly seed: LocalSeed;
    readonly bundleName: string;
    readonly trace: DeadCodeEliminationTrace;
};

function addSeed(input: AddSeedInput): Set<string> {
    const { bundleName, seed, seeds, trace } = input;
    const alreadyAdded = seeds.has(seed.bindingIdentifier);
    const nextSeeds = new Set(seeds);
    nextSeeds.add(seed.bindingIdentifier);
    if (!alreadyAdded && trace !== undefined) {
        trace.collector.record({
            type: 'local-seed-added',
            bundleName,
            bindingIdentifier: seed.bindingIdentifier,
            inputFilePath: seed.inputFilePath,
            line: seed.line,
            reason: seed.reason
        });
    }
    return nextSeeds;
}

export function gatherLocalSeeds(input: LocalSeedGatheringInput): Set<string> {
    let seeds = new Set<string>();
    for (const file of input.files) {
        const isEntry = input.entryPointFilePaths.has(file.targetFilePath);
        const fileSeeds = seedsForFile(file, isEntry, {
            declarationIndex: input.declarationIndex,
            deadCodeElimination: input.deadCodeElimination,
            classifySideEffects: input.classifySideEffects,
            trace: input.trace
        });
        for (const seed of fileSeeds) {
            seeds = addSeed({
                seeds,
                seed,
                bundleName: input.bundleName,
                trace: input.trace
            });
        }
    }
    return seeds;
}
