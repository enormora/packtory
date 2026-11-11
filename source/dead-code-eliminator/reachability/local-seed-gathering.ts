import { Node as TypeScriptMorphNode, type Statement } from 'ts-morph';
import type { ExportGraph } from '../exports/export-graph.ts';
import type { SideEffectClassifier } from '../side-effect-classifier.ts';
import type { DeadCodeEliminationSettings } from '../../configuration/dead-code-elimination-settings.ts';
import type { DeadCodeEliminationTrace, LocalSeedReason } from '../trace.ts';
import { bindingIdentifier, type FileBindings, type DeclarationNodeIndex } from './binding-identifier.ts';
import { collectIdentifierTargets } from './identifier-target-collector.ts';
import { collectImpureStatements } from './impure-statements.ts';

type LocalSeed = {
    readonly bindingIdentifier: string;
    readonly inputFilePath: string;
    readonly line: number;
    readonly reason: LocalSeedReason;
};

type SeedCollectionContext = {
    readonly exportGraph: ExportGraph | undefined;
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
    context: Pick<SeedCollectionContext, 'declarationIndex' | 'exportGraph'>,
    reason: LocalSeedReason
): readonly LocalSeed[] {
    return statements.flatMap(function (statement) {
        const targets = collectIdentifierTargets(statement, context.declarationIndex, context.exportGraph);
        const seeds = new Set(
            Array.from(targets).flatMap(function (target) {
                return [ target, ...context.exportGraph?.bindingDependencies(target) ?? [] ];
            })
        );
        return Array.from(
            seeds,
            function (seed) {
                return {
                    bindingIdentifier: seed,
                    inputFilePath: file.inputFilePath,
                    line: file.originalLineFor(statement),
                    reason
                };
            }
        );
    });
}

function entryPointExportDeclarationSeeds(
    file: FileBindings,
    context: SeedCollectionContext
): readonly LocalSeed[] {
    return file.sourceFile.getStatements().flatMap(function (statement) {
        return TypeScriptMorphNode.isExportDeclaration(statement)
            ? statementSeeds(file, [ statement ], context, 'entry-export-declaration')
            : [];
    });
}

function bindingLine(
    file: FileBindings,
    binding: FileBindings['bindings'][number],
    trace: DeadCodeEliminationTrace
): number {
    if (trace === undefined) {
        return 0;
    }
    return file.originalLineFor(binding.statement);
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
                    line: bindingLine(file, binding, trace),
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
        ...isEntry ? entryPointExportDeclarationSeeds(file, context) : [],
        ...statementSeeds(file, impureStatements, context, 'impure-statement')
    ];
}

type AddSeedInput = {
    readonly seeds: ReadonlySet<string>;
    readonly seed: LocalSeed;
    readonly bundleName: string;
    readonly trace: DeadCodeEliminationTrace;
    readonly exportGraph: ExportGraph | undefined;
};

function addSeed(input: AddSeedInput): Set<string> {
    const { bundleName, seed, seeds, trace } = input;
    const alreadyAdded = seeds.has(seed.bindingIdentifier);
    const nextSeeds = new Set(seeds);
    nextSeeds.add(seed.bindingIdentifier);
    if (!alreadyAdded && trace !== undefined && input.exportGraph?.nodes.has(seed.bindingIdentifier) !== true) {
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

function moduleEvaluationSeeds(input: LocalSeedGatheringInput, graph: ExportGraph): readonly LocalSeed[] {
    const bindings = new Set(graph.roots().flatMap(graph.bindingDependencies));
    return input.files.flatMap(function (file) {
        return file.bindings.flatMap(function (binding): readonly LocalSeed[] {
            const identifier = bindingIdentifier(file.targetFilePath, binding.name);
            return bindings.has(identifier)
                ? [ {
                    bindingIdentifier: identifier,
                    inputFilePath: file.inputFilePath,
                    line: bindingLine(file, binding, input.trace),
                    reason: 'module-evaluation'
                } ]
                : [];
        });
    });
}

export function gatherLocalSeeds(
    input: LocalSeedGatheringInput,
    exportGraph: ExportGraph | undefined
): Set<string> {
    let seeds = new Set<string>();
    for (const file of input.files) {
        const isEntry = input.entryPointFilePaths.has(file.targetFilePath);
        const fileSeeds = seedsForFile(file, isEntry, {
            exportGraph,
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
                trace: input.trace,
                exportGraph
            });
        }
    }
    const evaluationSeeds = exportGraph === undefined ? [] : moduleEvaluationSeeds(input, exportGraph);
    for (const seed of evaluationSeeds) {
        seeds = addSeed({ seeds, seed, bundleName: input.bundleName, trace: input.trace, exportGraph });
    }
    return seeds;
}
