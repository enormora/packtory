import type { DeadCodeEliminationTrace } from '../trace.ts';
import type { ExportGraph } from '../exports/export-graph.ts';
import type { BreadthFirstClosureDependencies } from './breadth-first-closure.ts';

type ReachabilityTraceContext = { readonly bundleName: string; readonly trace: DeadCodeEliminationTrace; };

export function createReachabilityTrace(
    input: ReachabilityTraceContext,
    dependencies: BreadthFirstClosureDependencies<string>,
    graph: Pick<ExportGraph, 'bindingDependencies' | 'nodes'>,
    seeds: ReadonlySet<string>
): BreadthFirstClosureDependencies<string> {
    const traced = new Set(seeds);
    return {
        visitedHas: dependencies.visitedHas,
        neighborAdded(fromBindingIdentifier, toBindingIdentifier) {
            if (graph.nodes.has(fromBindingIdentifier)) {
                return;
            }
            traced.add(fromBindingIdentifier);
            graph.bindingDependencies(toBindingIdentifier).forEach(function (target) {
                if (traced.has(target)) {
                    return;
                }
                traced.add(target);
                dependencies.neighborAdded?.(fromBindingIdentifier, target);
                input.trace?.collector.record({
                    type: 'edge-added',
                    bundleName: input.bundleName,
                    fromBindingIdentifier,
                    toBindingIdentifier: target,
                    reason: 'identifier-reference'
                });
            });
        }
    };
}
