import assert from 'node:assert';
import { suite, test } from 'mocha';
import { breadthFirstClosure, type BreadthFirstClosureDependencies } from './breadth-first-closure.ts';

const defaultDependencies: BreadthFirstClosureDependencies<string> = {
    visitedHas(visited, value) {
        return visited.has(value);
    },
    neighborAdded: undefined
};

function runBreadthFirst(
    seeds: readonly string[],
    expand: (identifier: string) => Iterable<string>,
    initialVisited: ReadonlySet<string> = new Set<string>(),
    maximumNodeCount = 10
): Set<string> {
    return breadthFirstClosure(seeds, expand, initialVisited, { maximumNodeCount, dependencies: defaultDependencies });
}

function fromGraph(graph: Readonly<Record<string, readonly string[]>>): (identifier: string) => readonly string[] {
    return function (identifier) {
        assert.notStrictEqual(identifier, undefined);
        return graph[identifier] ?? [];
    };
}

function noNeighbors(identifier: string): readonly string[] {
    assert.notStrictEqual(identifier, undefined);
    return [];
}

suite('bfs-closure', function () {
    test('breadthFirstClosure returns just the seeds when the expand function yields no neighbors', function () {
        assert.deepStrictEqual(runBreadthFirst([ 'a', 'b' ], noNeighbors), new Set([ 'a', 'b' ]));
    });

    test('breadthFirstClosure returns the initial visited set when no seeds are provided', function () {
        assert.deepStrictEqual(runBreadthFirst([], noNeighbors, new Set([ 'pre-a' ])), new Set([ 'pre-a' ]));
    });

    test('breadthFirstClosure accepts an empty seed list without expanding', function () {
        const expanded: string[] = [];

        assert.deepStrictEqual(
            runBreadthFirst([], function (identifier) {
                expanded.push(identifier);
                return [];
            }),
            new Set<string>()
        );
        assert.deepStrictEqual(expanded, []);
    });

    test('breadthFirstClosure expands transitively through neighbors yielded by expand', function () {
        assert.deepStrictEqual(
            runBreadthFirst([ 'a' ], fromGraph({ a: [ 'b' ], b: [ 'c' ], c: [] })),
            new Set([ 'a', 'b', 'c' ])
        );
    });

    test('breadthFirstClosure does not re-add neighbors that are already in the initial visited set', function () {
        const expandedNeighbors = new Set<string>();

        const result = runBreadthFirst(
            [ 'a' ],
            function (identifier) {
                const neighbors = identifier === 'a' ? [ 'b' ] : [];
                for (const neighbor of neighbors) {
                    expandedNeighbors.add(neighbor);
                }
                return neighbors;
            },
            new Set([ 'b' ])
        );

        assert.deepStrictEqual(result, new Set([ 'a', 'b' ]));
        assert.deepStrictEqual(expandedNeighbors, new Set([ 'b' ]));
    });

    test('breadthFirstClosure terminates on cycles without revisiting visited nodes', function () {
        assert.deepStrictEqual(
            runBreadthFirst([ 'a' ], fromGraph({ a: [ 'b' ], b: [ 'a', 'c' ], c: [] })),
            new Set([ 'a', 'b', 'c' ])
        );
    });

    suite('allocation and traversal contracts', function () {
        test('breadthFirstClosure allocates for reachable nodes independently of the traversal budget', function () {
            assert.deepStrictEqual(
                runBreadthFirst([ 'root' ], fromGraph({ root: [ 'leaf' ], leaf: [] }), new Set<string>(), 1_000_000),
                new Set([ 'root', 'leaf' ])
            );
        });

        test('breadthFirstClosure traverses wide graphs with deep branches in breadth-first order', function () {
            const branches = Array.from({ length: 10_000 }, function (_value, index) {
                return `branch-${index}`;
            });
            const expanded: string[] = [];
            const result = runBreadthFirst(
                [ 'root' ],
                function (identifier) {
                    expanded.push(identifier);
                    if (identifier === 'root') {
                        return branches;
                    }
                    return identifier.startsWith('branch-') ? [ `leaf-${identifier}` ] : [];
                },
                new Set<string>(),
                1_000_000
            );

            const expected = [
                'root',
                ...branches,
                ...branches.map(function (identifier) {
                    return `leaf-${identifier}`;
                })
            ];
            assert.deepStrictEqual(expanded, expected);
            assert.deepStrictEqual(result, new Set(expected));
        });

        test('breadthFirstClosure preserves seed order and reports each newly discovered neighbor once', function () {
            const expanded: string[] = [];
            const added: (readonly string[])[] = [];
            const initialVisited = new Set([ 'previous' ]);
            const result = breadthFirstClosure(
                [ 'a', 'b', 'a' ],
                function (identifier) {
                    expanded.push(identifier);
                    return fromGraph({ a: [ 'c', 'previous', 'c' ], b: [ 'c', 'd' ], c: [ 'a' ] })(identifier);
                },
                initialVisited,
                {
                    maximumNodeCount: 4,
                    dependencies: {
                        visitedHas: defaultDependencies.visitedHas,
                        neighborAdded(current, neighbor) {
                            added.push([ current, neighbor ]);
                        }
                    }
                }
            );

            assert.deepStrictEqual(expanded, [ 'a', 'b', 'a', 'c', 'd' ]);
            assert.deepStrictEqual(added, [ [ 'a', 'c' ], [ 'b', 'd' ] ]);
            assert.deepStrictEqual(result, new Set([ 'previous', 'a', 'b', 'c', 'd' ]));
            assert.deepStrictEqual(initialVisited, new Set([ 'previous' ]));
            result.add('later');
            assert.deepStrictEqual(initialVisited, new Set([ 'previous' ]));
        });

        test('breadthFirstClosure uses custom equality for neighbors with distinct identities', function () {
            const root = { identifier: 'root' };
            const leaf = { identifier: 'leaf' };
            const expanded: string[] = [];
            const result = breadthFirstClosure(
                [ root ],
                function (node) {
                    expanded.push(node.identifier);
                    return node.identifier === 'root' ? [ leaf, { identifier: 'leaf' } ] : [ { identifier: 'root' } ];
                },
                new Set([ { identifier: 'previous' } ]),
                {
                    maximumNodeCount: 3,
                    dependencies: {
                        visitedHas(visited, node) {
                            return Array.from(visited).some(function (candidate) {
                                return candidate.identifier === node.identifier;
                            });
                        },
                        neighborAdded: undefined
                    }
                }
            );

            assert.deepStrictEqual(expanded, [ 'root', 'leaf' ]);
            assert.deepStrictEqual(Array.from(result), [ { identifier: 'previous' }, root, leaf ]);
        });

        test('breadthFirstClosure succeeds when the queue empties on the final allowed expansion', function () {
            assert.deepStrictEqual(
                runBreadthFirst([ 'root' ], fromGraph({ root: [ 'leaf' ], leaf: [] }), new Set<string>(), 1),
                new Set([ 'root', 'leaf' ])
            );
        });
    });

    test('breadthFirstClosure throws when the iteration budget is exhausted', function () {
        let nextIdentifier = 0;
        assert.throws(function () {
            runBreadthFirst(
                [ 'root' ],
                function () {
                    assert.ok(nextIdentifier < 5, 'Traversal must stop after five expansions');
                    const next = String(nextIdentifier);
                    nextIdentifier += 1;
                    return [ next ];
                },
                new Set<string>(),
                2
            );
        }, { message: 'Reachability traversal exceeded 5 attempts' });
        assert.strictEqual(nextIdentifier, 5);
    });

    test('breadthFirstClosure throws when one expansion would exceed the exact iteration budget', function () {
        assert.throws(function () {
            runBreadthFirst([ 'root' ], fromGraph({ root: [ 'leaf' ], leaf: [] }), new Set<string>(), 0);
        }, { message: 'Reachability traversal exceeded 1 attempts' });
    });
});
