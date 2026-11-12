import { suite, test } from 'mocha';
import { assertSingleFileCallReduction } from '../test-libraries/dead-code-elimination-single-file-case.ts';

suite('BigInt computation elimination', function () {
    for (const expression of [ 'n*2n', 'n+21n', 'n-(-21n)', 'n/2n', 'n%2n', 'n<42n', 'n>=42n' ]) {
        test(`replaces the public result of ${expression}`, async function () {
            await assertSingleFileCallReduction({
                content: `function compute(n){return ${expression};}export function probe(){return compute(21n);}`,
                targetFilePath: 'index.js',
                callee: 'compute',
                remainingCalls: 0
            });
        });
    }

    for (const expression of [ 'n/0n', 'n%0n', 'n+2', '+n' ]) {
        test(`preserves the exception from ${expression}`, async function () {
            await assertSingleFileCallReduction({
                content: `function compute(n){return ${expression};}export function probe(){return compute(21n);}`,
                targetFilePath: 'index.js',
                callee: 'compute',
                remainingCalls: 1
            });
        });
    }

    test('folds recursive BigInt arithmetic', async function () {
        await assertSingleFileCallReduction({
            content: 'function compute(n){return n<=1n?1n:n*compute(n-1n);}' +
                'export function probe(){return compute(10n);}',
            targetFilePath: 'index.js',
            callee: 'compute',
            remainingCalls: 0
        });
    });
});
