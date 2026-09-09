import type { DeadCodeEliminationSettings } from '../../config/dead-code-elimination-settings.ts';
import { assertArtifactModuleReferenceContract } from '../artifact-module-reference-contract.ts';
import type { DeadCodeEliminationTrace } from '../trace.ts';
import { bfsClosure, type BfsClosureDependencies } from './bfs-closure.ts';
import { buildBindingsByFile, buildDeclarationNodeIndex, buildNodeById } from './binding-id.ts';
import { collectIdentifierTargets } from './identifier-target-collector.ts';
import { gatherLocalSeeds, type FileBindings } from './local-seed-gathering.ts';

export type ReachabilityInput = {
    readonly bundleName: string;
    readonly files: readonly FileBindings[];
    readonly entryPointFilePaths: ReadonlySet<string>;
    readonly deadCodeElimination?: DeadCodeEliminationSettings | undefined;
    readonly trace: DeadCodeEliminationTrace;
};

export type ReachabilityIndex = {
    readonly localReachable: ReadonlySet<string>;
    readonly bindingIdsByFile: ReadonlyMap<string, ReadonlySet<string>>;
    readonly expandWith: (externalSeeds: ReadonlySet<string> | undefined) => ReadonlySet<string>;
};

const emptyStringSet: ReadonlySet<string> = new Set<string>();
const defaultDependencies: BfsClosureDependencies<string> = {
    visitedHas(visited, value) {
        return visited.has(value);
    },
    neighborAdded: undefined
};

function tracedDependencies(
    input: ReachabilityInput,
    dependencies: BfsClosureDependencies<string>
): BfsClosureDependencies<string> {
    return {
        visitedHas: dependencies.visitedHas,
        neighborAdded(fromBindingId, toBindingId) {
            if (dependencies.neighborAdded !== undefined) {
                dependencies.neighborAdded(fromBindingId, toBindingId);
            }
            if (input.trace !== undefined) {
                input.trace.collector.record({
                    type: 'edge-added',
                    bundleName: input.bundleName,
                    fromBindingId,
                    toBindingId,
                    reason: 'identifier-reference'
                });
            }
        }
    };
}

export function buildReachabilityIndex(
    input: ReachabilityInput,
    dependencies: Partial<BfsClosureDependencies<string>> = {}
): ReachabilityIndex {
    assertArtifactModuleReferenceContract({
        bundleName: input.bundleName,
        files: input.files
    });
    const resolvedDependencies = tracedDependencies(input, { ...defaultDependencies, ...dependencies });
    const declarationIndex = buildDeclarationNodeIndex(input.files);
    const nodeById = buildNodeById(input.files);
    const maximumNodeCount = nodeById.size;
    const expand = function (id: string): Iterable<string> {
        const node = nodeById.get(id);
        return node === undefined ? emptyStringSet : collectIdentifierTargets(node, declarationIndex);
    };
    const localSeeds = gatherLocalSeeds({
        files: input.files,
        entryPointFilePaths: input.entryPointFilePaths,
        declarationIndex,
        deadCodeElimination: input.deadCodeElimination,
        bundleName: input.bundleName,
        trace: input.trace
    });
    const localReachable = bfsClosure(localSeeds, expand, emptyStringSet, {
        maximumNodeCount,
        dependencies: resolvedDependencies
    });
    return {
        localReachable,
        bindingIdsByFile: buildBindingsByFile(input.files),
        expandWith(externalSeeds) {
            if (externalSeeds === undefined || externalSeeds.size === 0) {
                return localReachable;
            }
            return bfsClosure(externalSeeds, expand, localReachable, {
                maximumNodeCount,
                dependencies: resolvedDependencies
            });
        }
    };
}
