import assert from 'node:assert';
import { suite, test } from 'mocha';
import { namespaceDemandLimits } from './namespace-demand-solver.ts';

suite('namespace demand limits', function () {
    for (
        const [ syntaxNodes, evaluations ] of [
            [ 0, 0 ],
            [ 1, 1 ],
            [ 3, 9 ],
            [ 14, 196 ],
            [ 27, 729 ],
            [ 181, 32_761 ],
            [ 182, 32_768 ]
        ] as const
    ) {
        test(`limits propagation for ${syntaxNodes} syntax nodes`, function () {
            assert.deepStrictEqual(namespaceDemandLimits(syntaxNodes), {
                maximumQueries: 2048,
                maximumEvaluations: evaluations
            });
        });
    }
});
