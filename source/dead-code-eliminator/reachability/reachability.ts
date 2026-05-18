import type { DeadCodeEliminationSettings } from '../../config/dead-code-elimination-settings.ts';
import { bfsClosure, type BfsClosureDependencies } from './bfs-closure.ts';
import { buildBindingsByFile, buildDeclarationNodeIndex, buildNodeById } from './binding-id.ts';
import { collectIdentifierTargets } from './identifier-target-collector.ts';
import { gatherLocalSeeds, type FileBindings } from './local-seed-gathering.ts';

export type ReachabilityInput = {
    readonly files: readonly FileBindings[];
    readonly entryPointFilePaths: ReadonlySet<string>;
    readonly deadCodeElimination?: DeadCodeEliminationSettings | undefined;
};

export type ReachabilityIndex = {
    readonly localReachable: ReadonlySet<string>;
    readonly bindingIdsByFile: ReadonlyMap<string, ReadonlySet<string>>;
    readonly expandWith: (externalSeeds: ReadonlySet<string> | undefined) => ReadonlySet<string>;
};

const emptyStringSet: ReadonlySet<string> = new Set<string>();
const defaultDependencies: BfsClosureDependencies = {
    visitedHas(visited, value) {
        return visited.has(value);
    }
};

export function buildReachabilityIndex(
    input: ReachabilityInput,
    dependencies: Partial<BfsClosureDependencies> = {}
): ReachabilityIndex {
    const resolvedDependencies = { ...defaultDependencies, ...dependencies };
    const declarationIndex = buildDeclarationNodeIndex(input.files);
    const nodeById = buildNodeById(input.files);
    const maximumNodeCount = nodeById.size;
    const expand = (id: string): Iterable<string> => {
        const node = nodeById.get(id);
        return node === undefined ? emptyStringSet : collectIdentifierTargets(node, declarationIndex);
    };
    const localSeeds = gatherLocalSeeds(
        input.files,
        input.entryPointFilePaths,
        declarationIndex,
        input.deadCodeElimination
    );
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
