import assert from 'node:assert';
import fastCheck from 'fast-check';
import { suite, test } from 'mocha';
import { breadthFirstClosure } from '../reachability/breadth-first-closure.ts';
import {
    allNamespaceProperties,
    mergeNamespaceDemand,
    namespaceProperties,
    noNamespaceProperties,
    type NamespaceDemand
} from './namespace-demand.ts';
import { createNamespaceDemandSolver, type NamespaceDemandSolver } from './namespace-demand-solver.ts';

type DemandNode = { readonly properties: readonly string[]; readonly dependencies: readonly number[]; };

function graphDemand(
    graph: readonly DemandNode[],
    solver: NamespaceDemandSolver<number>,
    index: number
): NamespaceDemand {
    const node = graph[index];
    if (node === undefined) {
        return allNamespaceProperties;
    }
    let result: NamespaceDemand = new Map(node.properties.map(function (name) {
        return [ name, noNamespaceProperties ];
    }));
    for (const dependency of node.dependencies) {
        result = mergeNamespaceDemand(
            result,
            solver.read(dependency, function () {
                return graphDemand(graph, solver, dependency);
            })
        );
    }
    return result;
}

function expectedProperties(graph: readonly DemandNode[], root: number): ReadonlySet<string> {
    const reached = breadthFirstClosure(
        [ root ],
        function (index) {
            return graph[index]?.dependencies ?? [];
        },
        new Set(),
        {
            maximumNodeCount: graph.length,
            dependencies: {
                visitedHas(visited, value) {
                    return visited.has(value);
                },
                neighborAdded: undefined
            }
        }
    );
    return new Set(
        Array.from(reached).flatMap(function (index) {
            return graph[index]?.properties ?? [];
        })
    );
}

const graphs = fastCheck.integer({ min: 1, max: 16 }).chain(function (size) {
    return fastCheck.array(
        fastCheck.record({
            properties: fastCheck.subarray([ 'first', 'second', 'third' ]),
            dependencies: fastCheck.uniqueArray(fastCheck.integer({ min: 0, max: size - 1 }), { maxLength: size })
        }),
        { minLength: size, maxLength: size }
    );
});

suite('namespace demand solver properties', function () {
    test('matches graph reachability independently of cycles and root order', function () {
        fastCheck.assert(
            fastCheck.property(graphs, function (graph) {
                const roots = graph.map(function (_node, index) {
                    return index;
                });
                for (const order of [ roots, roots.toReversed() ]) {
                    const solver = createNamespaceDemandSolver<number>({
                        maximumQueries: 32,
                        maximumEvaluations: 4096
                    });
                    for (const root of order) {
                        const actual = solver.resolve(root, function () {
                            return graphDemand(graph, solver, root);
                        });
                        assert.deepStrictEqual(namespaceProperties(actual), expectedProperties(graph, root));
                    }
                }
            }),
            { numRuns: 500 }
        );
    });
});
