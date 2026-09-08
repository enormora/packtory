import { Node as TsMorphNode, type SourceFile, type Statement } from 'ts-morph';
import type { DeadCodeEliminationSettings } from '../../config/dead-code-elimination-settings.ts';
import type { DeadCodeEliminationTrace, LocalSeedReason } from '../trace.ts';
import { bindingId, type FileBindingSet } from './binding-id.ts';
import { collectIdentifierTargets, type DeclarationNodeIndex } from './identifier-target-collector.ts';
import { collectImpureStatements } from './impure-statements.ts';

export type FileBindings = FileBindingSet & {
    readonly sourceFile: Readonly<SourceFile>;
};

type LocalSeed = {
    readonly bindingId: string;
    readonly inputFilePath: string;
    readonly line: number;
    readonly reason: LocalSeedReason;
};

type SeedCollectionContext = {
    readonly declarationIndex: DeclarationNodeIndex;
    readonly deadCodeElimination: DeadCodeEliminationSettings | undefined;
    readonly trace: DeadCodeEliminationTrace;
};

export type LocalSeedGatheringInput = {
    readonly files: readonly FileBindings[];
    readonly entryPointFilePaths: ReadonlySet<string>;
    readonly declarationIndex: DeclarationNodeIndex;
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
                bindingId: seed,
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
        return TsMorphNode.isExportDeclaration(statement)
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
                    bindingId: bindingId(file.targetFilePath, binding.name),
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
    const impureStatements = collectImpureStatements(file.sourceFile, context.deadCodeElimination);
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
    const alreadyAdded = seeds.has(seed.bindingId);
    const nextSeeds = new Set(seeds);
    nextSeeds.add(seed.bindingId);
    if (!alreadyAdded && trace !== undefined) {
        trace.collector.record({
            type: 'local-seed-added',
            bundleName,
            bindingId: seed.bindingId,
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
