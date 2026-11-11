import type { SideEffectClassifier } from '../side-effect-classifier.ts';
import type { DeadCodeEliminationSettings } from '../../configuration/dead-code-elimination-settings.ts';
import { assertArtifactModuleReferenceContract } from '../artifact-module-reference-contract.ts';
import type { DeadCodeEliminationTrace } from '../trace.ts';
import { createExportGraph, type ExportGraph } from '../exports/export-graph.ts';
import { createReachabilityTrace } from './reachability-trace.ts';
import { breadthFirstClosure, type BreadthFirstClosureDependencies } from './breadth-first-closure.ts';
import {
    buildBindingsByFile,
    buildDeclarationNodeIndex,
    buildNodeByIdentifier,
    type DeclarationNodeIndex,
    type FileBindings
} from './binding-identifier.ts';
import { collectIdentifierTargets } from './identifier-target-collector.ts';
import { gatherLocalSeeds } from './local-seed-gathering.ts';

export type ReachabilityInput = {
    readonly bundleName: string;
    readonly files: readonly FileBindings[];
    readonly entryPointFilePaths: ReadonlySet<string>;
    readonly classifySideEffects: SideEffectClassifier;
    readonly deadCodeElimination?: DeadCodeEliminationSettings | undefined;
    readonly trace: DeadCodeEliminationTrace;
};

export type ReachabilityIndex = {
    readonly localReachable: ReadonlySet<string>;
    readonly bindingIdentifiersByFile: ReadonlyMap<string, ReadonlySet<string>>;
    readonly expandWith: (externalSeeds: ReadonlySet<string> | undefined) => ReadonlySet<string>;
    readonly resolveWith: (externalSeeds: ReadonlySet<string> | undefined) => ReachabilityResult;
};

type ReachabilityResult = {
    readonly bindings: ReadonlySet<string>;
    readonly exports: ReadonlyMap<string, ReadonlySet<string>>;
};

const emptyStringSet: ReadonlySet<string> = new Set<string>();
const defaultDependencies: BreadthFirstClosureDependencies<string> = {
    visitedHas(visited, value) {
        return visited.has(value);
    },
    neighborAdded: undefined
};

type BindingGraph = {
    readonly declarationIndex: DeclarationNodeIndex;
    readonly exportGraph: ExportGraph;
    readonly maximumNodeCount: number;
    readonly expand: (identifier: string) => Iterable<string>;
    readonly bindingTargets: (reachable: ReadonlySet<string>) => ReadonlySet<string>;
};

function createBindingGraph(input: ReachabilityInput, observedBindings: ReadonlySet<string> | undefined): BindingGraph {
    const declarationIndex = buildDeclarationNodeIndex(input.files);
    const exportGraph = createExportGraph({
        files: input.files,
        publicPaths: input.entryPointFilePaths,
        classifySideEffects: input.classifySideEffects,
        settings: input.deadCodeElimination,
        observedBindings
    });
    const nodeByIdentifier = buildNodeByIdentifier(input.files);
    return {
        declarationIndex,
        exportGraph,
        maximumNodeCount: nodeByIdentifier.size + exportGraph.nodes.size,
        expand(identifier) {
            const exportTargets = exportGraph.nodes.get(identifier);
            if (exportTargets !== undefined) {
                return exportTargets();
            }
            const node = nodeByIdentifier.get(identifier);
            return node === undefined ? emptyStringSet : collectIdentifierTargets(node, declarationIndex, exportGraph);
        },
        bindingTargets(reachable) {
            return new Set(
                Array.from(reachable).filter(function (identifier) {
                    return !exportGraph.nodes.has(identifier);
                })
            );
        }
    };
}

function requestedExportTargets(
    graph: BindingGraph,
    externalSeeds: ReadonlySet<string> | undefined
): (identifier: string) => Iterable<string> {
    return function (identifier) {
        return externalSeeds?.has(identifier) === true
            ? [ ...graph.expand(identifier), ...graph.exportGraph.externalTargets(new Set([ identifier ])) ]
            : graph.expand(identifier);
    };
}

function traverseBindings(
    input: ReachabilityInput,
    graph: BindingGraph,
    externalSeeds: ReadonlySet<string> | undefined,
    dependencies: BreadthFirstClosureDependencies<string>
): ReadonlySet<string> {
    const localSeeds = gatherLocalSeeds({
        files: input.files,
        entryPointFilePaths: input.entryPointFilePaths,
        declarationIndex: graph.declarationIndex,
        deadCodeElimination: input.deadCodeElimination,
        classifySideEffects: input.classifySideEffects,
        bundleName: input.bundleName,
        trace: input.trace
    }, graph.exportGraph);
    const seeds = new Set([ ...localSeeds, ...externalSeeds ?? [] ]);
    return breadthFirstClosure(
        [ ...seeds, ...graph.exportGraph.roots() ],
        requestedExportTargets(graph, externalSeeds),
        emptyStringSet,
        {
            maximumNodeCount: graph.maximumNodeCount,
            dependencies: createReachabilityTrace(input, dependencies, graph.exportGraph, seeds)
        }
    );
}

type ConservativeReachability = { readonly graph: BindingGraph; readonly closure: ReadonlySet<string>; };

function refineReachability(
    input: ReachabilityInput,
    conservative: ConservativeReachability,
    externalSeeds: ReadonlySet<string> | undefined,
    dependencies: BreadthFirstClosureDependencies<string>
): ReachabilityResult {
    const observed = externalSeeds === undefined
        ? conservative.closure
        : breadthFirstClosure(
            externalSeeds,
            requestedExportTargets(conservative.graph, externalSeeds),
            conservative.closure,
            {
                maximumNodeCount: conservative.graph.maximumNodeCount,
                dependencies: defaultDependencies
            }
        );
    const graph = createBindingGraph(input, observed);
    const closure = traverseBindings(input, graph, externalSeeds, dependencies);
    return { bindings: graph.bindingTargets(closure), exports: graph.exportGraph.survivingExports(closure) };
}

export function buildReachabilityIndex(
    input: ReachabilityInput,
    dependencies: Partial<BreadthFirstClosureDependencies<string>> = {}
): ReachabilityIndex {
    assertArtifactModuleReferenceContract({ bundleName: input.bundleName, files: input.files });
    const graph = createBindingGraph(input, undefined);
    const conservative = {
        graph,
        closure: traverseBindings({ ...input, trace: undefined }, graph, undefined, defaultDependencies)
    };
    const resolvedDependencies = { ...defaultDependencies, ...dependencies };
    const local = refineReachability(input, conservative, undefined, resolvedDependencies);
    const resolve = function (externalSeeds: ReadonlySet<string> | undefined): ReachabilityResult {
        return externalSeeds === undefined || externalSeeds.size === 0
            ? local
            : refineReachability(input, conservative, externalSeeds, resolvedDependencies);
    };
    return {
        localReachable: local.bindings,
        bindingIdentifiersByFile: buildBindingsByFile(input.files),
        expandWith(externalSeeds) {
            return resolve(externalSeeds).bindings;
        },
        resolveWith: resolve
    };
}
