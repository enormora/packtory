import assert from 'node:assert';
import fastCheck from 'fast-check';
import { suite, test } from 'mocha';
import { allNamespaceProperties, mergeNamespaceDemand, type NamespaceDemand } from './namespace-demand.ts';

function expectedJoin(left: NamespaceDemand, right: NamespaceDemand): NamespaceDemand {
    if (left === allNamespaceProperties || right === allNamespaceProperties) {
        return allNamespaceProperties;
    }
    const result = new Map(left);
    for (const [ name, demand ] of right) {
        const previous = result.get(name);
        result.set(name, previous === undefined ? demand : expectedJoin(previous, demand));
    }
    return result;
}

const demands = fastCheck
    .letrec<{ readonly demand: NamespaceDemand; }>(function (tie) {
        return {
            demand: fastCheck.oneof(
                { maxDepth: 4 },
                fastCheck.constant<NamespaceDemand>(allNamespaceProperties),
                fastCheck
                    .array(fastCheck.tuple(fastCheck.constantFrom('first', 'second', 'third'), tie('demand')), {
                        maxLength: 4
                    })
                    .map(function (entries) {
                        return new Map(entries);
                    })
            )
        };
    })
    .demand;

suite('namespace demand properties', function () {
    test('matches finite-tree joins and reuses fixed points', function () {
        fastCheck.assert(
            fastCheck.property(demands, demands, function (firstConsumer, secondConsumer) {
                const actual = mergeNamespaceDemand(firstConsumer, secondConsumer);
                assert.deepStrictEqual(actual, expectedJoin(firstConsumer, secondConsumer));
                assert.deepStrictEqual(actual, mergeNamespaceDemand(secondConsumer, firstConsumer));
                assert.strictEqual(mergeNamespaceDemand(actual, secondConsumer), actual);
            }),
            { numRuns: 500 }
        );
    });
});
