import assert from 'node:assert';
import { suite, test } from 'mocha';
import { bfsClosure, type BfsClosureDependencies } from './bfs-closure.ts';

const defaultDependencies: BfsClosureDependencies = {
    visitedHas(visited, value) {
        return visited.has(value);
    }
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
    return (id) => graph[id] ?? [];
}

function noNeighbors(): readonly string[] {
    return [];
}

suite('bfs-closure', function () {
    test('bfsClosure returns just the seeds when the expand function yields no neighbors', function () {
        assert.deepStrictEqual(runBfs(['a', 'b'], noNeighbors), new Set(['a', 'b']));
    });

    test('bfsClosure returns the initial visited set when no seeds are provided', function () {
        assert.deepStrictEqual(runBfs([], noNeighbors, new Set(['pre-a'])), new Set(['pre-a']));
    });

    test('bfsClosure expands transitively through neighbors yielded by expand', function () {
        assert.deepStrictEqual(runBfs(['a'], fromGraph({ a: ['b'], b: ['c'], c: [] })), new Set(['a', 'b', 'c']));
    });

    test('bfsClosure does not re-add neighbors that are already in the initial visited set', function () {
        const expandedNeighbors = new Set<string>();

        const result = runBfs(
            ['a'],
            (id) => {
                const neighbors = id === 'a' ? ['b'] : [];
                for (const neighbor of neighbors) {
                    expandedNeighbors.add(neighbor);
                }
                return neighbors;
            },
            new Set(['b'])
        );

        assert.deepStrictEqual(result, new Set(['a', 'b']));
        assert.deepStrictEqual(expandedNeighbors, new Set(['b']));
    });

    test('bfsClosure terminates on cycles without revisiting visited nodes', function () {
        assert.deepStrictEqual(runBfs(['a'], fromGraph({ a: ['b'], b: ['a', 'c'], c: [] })), new Set(['a', 'b', 'c']));
    });

    test('bfsClosure throws when the iteration budget is exhausted', function () {
        let nextId = 0;
        try {
            runBfs(
                ['root'],
                () => {
                    const next = `${nextId}`;
                    nextId += 1;
                    return [next];
                },
                new Set<string>(),
                2
            );
            assert.fail('Expected bfsClosure() to throw but it did not');
        } catch (error: unknown) {
            assert.strictEqual(
                (error as Error).message,
                'Reachability traversal exceeded the maximum iteration budget'
            );
        }
    });
});
