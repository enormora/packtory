import assert from 'node:assert';
import fastCheck from 'fast-check';
import { suite, test } from 'mocha';
import { SyntaxKind } from 'ts-morph';
import { variableInitializer } from '../pure-expression-test-support.ts';
import { assertDefined } from '../../test-libraries/deep-subset-assertion.ts';
import { evaluateLocalCall } from './local-call.ts';

function evaluate(content: string): unknown {
    const call = variableInitializer(content, 'result').asKindOrThrow(SyntaxKind.CallExpression);
    const result = evaluateLocalCall(call);
    assertDefined(result);
    return result.value;
}

suite('bounded record evaluation properties', function () {
    test('reads computed own keys without prototype interpretation', function () {
        fastCheck.assert(
            fastCheck.property(fastCheck.integer(), fastCheck.string({ maxLength: 16 }), function (value, key) {
                const content = `function compute(n,key){const record={[key]:n};return record[key];}
                    const result=compute(${String(value)},${JSON.stringify(key)});`;
                assert.strictEqual(evaluate(content), value);
            }),
            { numRuns: 25 }
        );
    });

    test('distinguishes shared and fresh allocations', function () {
        fastCheck.assert(
            fastCheck.property(fastCheck.boolean(), function (shared) {
                const content = `function compute(shared){const left={answer:42};
                    const right=shared?left:{answer:42};return left===right;}
                    const result=compute(${String(shared)});`;
                assert.strictEqual(evaluate(content), shared);
            }),
            { numRuns: 25 }
        );
    });

    test('preserves receiver evaluation before computed key mutation', function () {
        fastCheck.assert(
            fastCheck.property(fastCheck.integer({ min: -1000, max: 1000 }), function (value) {
                const content = `function compute(n){return ({answer:n})[(n+=1,"answer")]+n;}
                    const result=compute(${String(value)});`;
                assert.strictEqual(evaluate(content), value * 2 + 1);
            }),
            { numRuns: 25 }
        );
    });

    test('returns data through recursively allocated records', function () {
        fastCheck.assert(
            fastCheck.property(
                fastCheck.integer({ min: 0, max: 8 }),
                fastCheck.integer(),
                function (depth, value) {
                    const recordPath = '.next'.repeat(depth);
                    const content = `function make(n,value){return n===0?{answer:value}:{next:make(n-1,value)};}
                        function compute(){return make(${String(depth)},${String(value)})${recordPath}.answer;}
                        const result=compute();`;
                    assert.strictEqual(evaluate(content), value);
                }
            ),
            { numRuns: 25 }
        );
    });

    test('accumulates loop state through record references', function () {
        fastCheck.assert(
            fastCheck.property(fastCheck.integer({ min: 0, max: 20 }), function (limit) {
                const content = `function compute(n){const state={sum:0};
                    for(let i=0;i<n;i++)state.sum+=i;return state.sum;}
                    const result=compute(${String(limit)});`;
                const expected = limit === 0 ? 0 : limit * (limit - 1) / 2;
                assert.strictEqual(evaluate(content), expected);
            }),
            { numRuns: 25 }
        );
    });

    test('captures compound values before right side field writes', function () {
        fastCheck.assert(
            fastCheck.property(fastCheck.integer({ min: -1000, max: 1000 }), function (value) {
                const content = `function compute(n){let reads=0;const state={n};
                    state[(reads++,"n")]+=((state.n=n+100),2);return state.n*10+reads;}
                    const result=compute(${String(value)});`;
                assert.strictEqual(evaluate(content), (value + 2) * 10 + 1);
            }),
            { numRuns: 25 }
        );
    });

    test('keeps captured receivers across variable reassignment', function () {
        fastCheck.assert(
            fastCheck.property(fastCheck.string({ maxLength: 8 }), function (key) {
                const content = `function compute(key){let state={[key]:1};const original=state;
                    state[key]=(state={[key]:9},2);return original[key]*100+state[key];}
                    const result=compute(${JSON.stringify(key)});`;
                assert.strictEqual(evaluate(content), 209);
            }),
            { numRuns: 25 }
        );
    });

    test('selects logical assignment results without evaluating bypassed writes', function () {
        const values = fastCheck.oneof(
            fastCheck.constant(null),
            fastCheck.constant(undefined),
            fastCheck.boolean(),
            fastCheck.integer({ min: -3, max: 3 }),
            fastCheck.string({ maxLength: 4 })
        );
        fastCheck.assert(
            fastCheck.property(values, fastCheck.constantFrom('||=', '&&=', '??='), function (value, operator) {
                const literal = value === undefined ? 'void 0' : JSON.stringify(value);
                const content =
                    `function compute(value){const state={value};state.value${operator}42;return state.value;}
                    const result=compute(${literal});`;
                const truthy = Boolean(value);
                const expected = {
                    '||=': truthy ? value : 42,
                    '&&=': truthy ? 42 : value,
                    '??=': value ?? 42
                };
                assert.strictEqual(evaluate(content), expected[operator]);
            }),
            { numRuns: 25 }
        );
    });
});
