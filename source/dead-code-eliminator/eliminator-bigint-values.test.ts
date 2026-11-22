import { suite, test } from 'mocha';
import { assertExpressionEvaluation } from '../test-libraries/expression-evaluation-case.ts';

suite('BigInt computation elimination', function () {
    for (
        const [ expression, value ] of [
            [ 'n*2n', 42n ],
            [ 'n+21n', 42n ],
            [ 'n-(-21n)', 42n ],
            [ 'n/2n', 10n ],
            [ 'n%2n', 1n ],
            [ 'n<42n', true ],
            [ 'n>=42n', false ]
        ] as const
    ) {
        test(`replaces the public result of ${expression}`, function () {
            assertExpressionEvaluation({
                name: expression,
                content: `function compute(n){return ${expression};}export const value=compute(21n);`,
                result: { value }
            });
        });
    }
    for (const expression of [ 'n/0n', 'n%0n', 'n+2', '+n' ]) {
        test(`preserves the exception from ${expression}`, function () {
            assertExpressionEvaluation({
                name: expression,
                content: `function compute(n){return ${expression};}export const value=compute(21n);`,
                result: undefined
            });
        });
    }

    test('folds recursive BigInt arithmetic', function () {
        assertExpressionEvaluation({
            name: 'BigInt factorial',
            content: 'function compute(n){return n<=1n?1n:n*compute(n-1n);}export const value=compute(10n);',
            result: { value: 3_628_800n }
        });
    });
});
