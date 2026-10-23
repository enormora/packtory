import type { SideEffectClassifier } from '../side-effect-classifier.ts';
import type { DeadCodeEliminationSettings } from '../../configuration/dead-code-elimination-settings.ts';
import { assertArtifactModuleReferenceContract } from '../artifact-module-reference-contract.ts';
import type { DeadCodeEliminationTrace } from '../trace.ts';
import { breadthFirstClosure, type BreadthFirstClosureDependencies } from './breadth-first-closure.ts';
import { buildBindingsByFile, buildDeclarationNodeIndex, buildNodeByIdentifier } from './binding-identifier.ts';
import { collectIdentifierTargets } from './identifier-target-collector.ts';
import { gatherLocalSeeds, type FileBindings } from './local-seed-gathering.ts';

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
};

const emptyStringSet: ReadonlySet<string> = new Set<string>();
const defaultDependencies: BreadthFirstClosureDependencies<string> = {
    visitedHas(visited, value) {
        return visited.has(value);
    },
    neighborAdded: undefined
};

function tracedDependencies(
    input: ReachabilityInput,
    dependencies: BreadthFirstClosureDependencies<string>
): BreadthFirstClosureDependencies<string> {
    return {
        visitedHas: dependencies.visitedHas,
        neighborAdded(fromBindingIdentifier, toBindingIdentifier) {
            if (dependencies.neighborAdded !== undefined) {
                dependencies.neighborAdded(fromBindingIdentifier, toBindingIdentifier);
            }
            if (input.trace !== undefined) {
                input.trace.collector.record({
                    type: 'edge-added',
                    bundleName: input.bundleName,
                    fromBindingIdentifier,
                    toBindingIdentifier,
                    reason: 'identifier-reference'
                });
            }
        }
    };
}

export function buildReachabilityIndex(
    input: ReachabilityInput,
    dependencies: Partial<BreadthFirstClosureDependencies<string>> = {}
): ReachabilityIndex {
    assertArtifactModuleReferenceContract({
        bundleName: input.bundleName,
        files: input.files
    });
    const resolvedDependencies = tracedDependencies(input, { ...defaultDependencies, ...dependencies });
    const declarationIndex = buildDeclarationNodeIndex(input.files);
    const nodeByIdentifier = buildNodeByIdentifier(input.files);
    const maximumNodeCount = nodeByIdentifier.size;
    const expand = function (identifier: string): Iterable<string> {
        const node = nodeByIdentifier.get(identifier);
        return node === undefined ? emptyStringSet : collectIdentifierTargets(node, declarationIndex);
    };
    const localSeeds = gatherLocalSeeds({
        files: input.files,
        entryPointFilePaths: input.entryPointFilePaths,
        declarationIndex,
        deadCodeElimination: input.deadCodeElimination,
        classifySideEffects: input.classifySideEffects,
        bundleName: input.bundleName,
        trace: input.trace
    });
    const localReachable = breadthFirstClosure(localSeeds, expand, emptyStringSet, {
        maximumNodeCount,
        dependencies: resolvedDependencies
    });
    return {
        localReachable,
        bindingIdentifiersByFile: buildBindingsByFile(input.files),
        expandWith(externalSeeds) {
            if (externalSeeds === undefined || externalSeeds.size === 0) {
                return localReachable;
            }
            return breadthFirstClosure(externalSeeds, expand, localReachable, {
                maximumNodeCount,
                dependencies: resolvedDependencies
            });
        }
    };
}
