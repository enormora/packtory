import assert from 'node:assert';
import { suite, test } from 'mocha';
import { namespaceDemandLimits } from './namespace-demand-solver.ts';

suite('namespace demand limits', function () {
    for (
        const [ syntaxSizes, evaluations ] of [
            [ [], 1 ],
            [ [ 0 ], 1 ],
            [ [ 2 ], 9 ],
            [ [ 13 ], 196 ],
            [ [ 13, 13 ], 729 ],
            [ [ 180 ], 32_761 ],
            [ [ 181 ], 32_768 ]
        ] as const
    ) {
        test(`limits propagation for syntax sizes ${JSON.stringify(syntaxSizes)}`, function () {
            assert.deepStrictEqual(namespaceDemandLimits(syntaxSizes), {
                maximumQueries: 2048,
                maximumEvaluations: evaluations
            });
        });
    }
});
