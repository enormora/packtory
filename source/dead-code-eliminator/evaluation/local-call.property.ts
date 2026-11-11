import assert from 'node:assert';
import fastCheck from 'fast-check';
import { suite, test } from 'mocha';
import { isPureExpression } from '../../test-libraries/expression-purity-test-support.ts';
import { variableInitializer } from '../pure-expression-test-support.ts';

function loopCall(limit: number, expected: number): string {
    return `
        function compute(limit) {
            let sum = 0;
            for (let i = 0; i < limit; i++) sum += i;
            if (sum !== ${String(expected)}) console.log("effect");
            return sum;
        }
        const unused = compute(${String(limit)});
    `;
}

suite('bounded evaluation branch soundness', function () {
    test('distinguishes observable and unobservable loop outcomes', function () {
        fastCheck.assert(
            fastCheck.property(fastCheck.integer({ min: 0, max: 20 }), function (limit) {
                const expected = limit * (limit - 1) / 2;
                const pure = variableInitializer(loopCall(limit, expected), 'unused');
                const observable = variableInitializer(loopCall(limit, expected + 1), 'unused');
                assert.strictEqual(isPureExpression(pure, undefined), true);
                assert.strictEqual(isPureExpression(observable, undefined), false);
            }),
            { numRuns: 25 }
        );
    });

    test('preserves effects selected by recursive computation', function () {
        fastCheck.assert(
            fastCheck.property(fastCheck.integer({ min: 0, max: 15 }), function (limit) {
                const expected = limit * (limit + 1) / 2;
                const content = `
                function sum(n) { return n <= 0 ? 0 : n + sum(n - 1); }
                function compute(n) { if (sum(n) !== ${String(expected)}) console.log("effect"); return n; }
                const unused = compute(${String(limit)});
            `;
                assert.strictEqual(isPureExpression(variableInitializer(content, 'unused'), undefined), true);
                const observable = content.replace(`!== ${String(expected)}`, function () {
                    return `!== ${String(expected + 1)}`;
                });
                assert.strictEqual(isPureExpression(variableInitializer(observable, 'unused'), undefined), false);
            }),
            { numRuns: 25 }
        );
    });
});
