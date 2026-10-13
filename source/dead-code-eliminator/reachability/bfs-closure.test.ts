import assert from 'node:assert';
import { suite, test } from 'mocha';
import { bfsClosure, type BfsClosureDependencies } from './bfs-closure.ts';

const defaultDependencies: BfsClosureDependencies<string> = {
    visitedHas(visited, value) {
        return visited.has(value);
    },
    neighborAdded: undefined
};

function runBfs(
    seeds: readonly string[],
    expand: (id: string) => Iterable<string>,
    initialVisited: ReadonlySet<string> = new Set<string>(),
    maximumNodeCount = 10
): Set<string> {
    return bfsClosure(seeds, expand, initialVisited, { maximumNodeCount, dependencies: defaultDependencies });
}

function fromGraph(graph: Readonly<Record<string, readonly string[]>>): (id: string) => readonly string[] {
    return function (id) {
        return graph[id] ?? [];
    };
}

function noNeighbors(): readonly string[] {
    return [];
}

suite('bfs-closure', function () {
    test('bfsClosure returns just the seeds when the expand function yields no neighbors', function () {
        assert.deepStrictEqual(runBfs([ 'a', 'b' ], noNeighbors), new Set([ 'a', 'b' ]));
    });

    test('bfsClosure returns the initial visited set when no seeds are provided', function () {
        assert.deepStrictEqual(runBfs([], noNeighbors, new Set([ 'pre-a' ])), new Set([ 'pre-a' ]));
    });

    test('bfsClosure accepts an empty seed list without expanding', function () {
        const expanded: string[] = [];

        assert.deepStrictEqual(
            runBfs([], function (id) {
                expanded.push(id);
                return [];
            }),
            new Set<string>()
        );
        assert.deepStrictEqual(expanded, []);
    });

    test('bfsClosure expands transitively through neighbors yielded by expand', function () {
        assert.deepStrictEqual(
            runBfs([ 'a' ], fromGraph({ a: [ 'b' ], b: [ 'c' ], c: [] })),
            new Set([ 'a', 'b', 'c' ])
        );
    });

    test('bfsClosure does not re-add neighbors that are already in the initial visited set', function () {
        const expandedNeighbors = new Set<string>();

        const result = runBfs(
            [ 'a' ],
            function (id) {
                const neighbors = id === 'a' ? [ 'b' ] : [];
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

    test('bfsClosure terminates on cycles without revisiting visited nodes', function () {
        assert.deepStrictEqual(
            runBfs([ 'a' ], fromGraph({ a: [ 'b' ], b: [ 'a', 'c' ], c: [] })),
            new Set([ 'a', 'b', 'c' ])
        );
    });

    suite('allocation and traversal contracts', function () {
        test('bfsClosure allocates for reachable nodes independently of the traversal budget', function () {
            assert.deepStrictEqual(
                runBfs([ 'root' ], fromGraph({ root: [ 'leaf' ], leaf: [] }), new Set<string>(), 1_000_000),
                new Set([ 'root', 'leaf' ])
            );
        });

        test('bfsClosure traverses wide graphs with deep branches in breadth-first order', function () {
            const branches = Array.from({ length: 10_000 }, function (_value, index) {
                return `branch-${index}`;
            });
            const expanded: string[] = [];
            const result = runBfs(
                [ 'root' ],
                function (id) {
                    expanded.push(id);
                    if (id === 'root') {
                        return branches;
                    }
                    return id.startsWith('branch-') ? [ `leaf-${id}` ] : [];
                },
                new Set<string>(),
                1_000_000
            );

            const expected = [
                'root',
                ...branches,
                ...branches.map(function (id) {
                    return `leaf-${id}`;
                })
            ];
            assert.deepStrictEqual(expanded, expected);
            assert.deepStrictEqual(result, new Set(expected));
        });

        test('bfsClosure preserves seed order and reports each newly discovered neighbor once', function () {
            const expanded: string[] = [];
            const added: (readonly string[])[] = [];
            const initialVisited = new Set([ 'previous' ]);
            const result = bfsClosure(
                [ 'a', 'b', 'a' ],
                function (id) {
                    expanded.push(id);
                    return fromGraph({ a: [ 'c', 'previous', 'c' ], b: [ 'c', 'd' ], c: [ 'a' ] })(id);
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

        test('bfsClosure uses custom equality for neighbors with distinct identities', function () {
            const root = { id: 'root' };
            const leaf = { id: 'leaf' };
            const expanded: string[] = [];
            const result = bfsClosure(
                [ root ],
                function (node) {
                    expanded.push(node.id);
                    return node.id === 'root' ? [ leaf, { id: 'leaf' } ] : [ { id: 'root' } ];
                },
                new Set([ { id: 'previous' } ]),
                {
                    maximumNodeCount: 3,
                    dependencies: {
                        visitedHas(visited, node) {
                            return Array.from(visited).some(function (candidate) {
                                return candidate.id === node.id;
                            });
                        },
                        neighborAdded: undefined
                    }
                }
            );

            assert.deepStrictEqual(expanded, [ 'root', 'leaf' ]);
            assert.deepStrictEqual(Array.from(result), [ { id: 'previous' }, root, leaf ]);
        });

        test('bfsClosure succeeds when the queue empties on the final allowed expansion', function () {
            assert.deepStrictEqual(
                runBfs([ 'root' ], fromGraph({ root: [ 'leaf' ], leaf: [] }), new Set<string>(), 1),
                new Set([ 'root', 'leaf' ])
            );
        });
    });

    test('bfsClosure throws when the iteration budget is exhausted', function () {
        let nextId = 0;
        try {
            runBfs(
                [ 'root' ],
                function () {
                    const next = String(nextId);
                    nextId += 1;
                    return [ next ];
                },
                new Set<string>(),
                2
            );
            assert.fail('Expected bfsClosure() to throw but it did not');
        } catch (error: unknown) {
            assert.strictEqual(
                (error as Error).message,
                'Reachability traversal exceeded 5 attempts'
            );
        }
    });

    test('bfsClosure throws when one expansion would exceed the exact iteration budget', function () {
        assert.throws(function () {
            runBfs([ 'root' ], fromGraph({ root: [ 'leaf' ], leaf: [] }), new Set<string>(), 0);
        }, { message: 'Reachability traversal exceeded 1 attempts' });
    });
});
