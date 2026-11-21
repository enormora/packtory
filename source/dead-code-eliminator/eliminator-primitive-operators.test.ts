import { suite, test } from 'mocha';
import { assertExpressionEvaluation } from '../test-libraries/expression-evaluation-case.ts';

suite('primitive operator elimination', function () {
    for (
        const [ expression, argument, value ] of [
            [ 'value & 3', '7', 3 ],
            [ 'value | 3', '4', 7 ],
            [ 'value ^ 3', '7', 4 ],
            [ 'value << 33', '1', 2 ],
            [ 'value >> 1', '8', 4 ],
            [ 'value >>> 1', '-1', 2_147_483_647 ],
            [ 'value ** 4', '2', 16 ],
            [ '~value', '1', -2 ],
            [ '"prefix" + value', '21', 'prefix21' ],
            [ 'value + "suffix"', '21n', '21suffix' ],
            [ 'value ^ 1', '(0/0)', 1 ],
            [ 'value >>> 0', '-3.9', 4_294_967_293 ],
            [ 'value + 1', 'null', 1 ],
            [ 'value + 1', 'true', 2 ],
            [ 'value - 1', '"2"', 1 ],
            [ 'value > "a"', '"b"', true ],
            [ 'value < "2"', '"10"', true ],
            [ 'value < 2n', '1', true ],
            [ 'value < "2"', '1n', true ],
            [ 'value < "9007199254740993"', '9007199254740992n', true ],
            [ 'value == 1', 'true', true ],
            [ 'value == 1', '"1"', true ],
            [ 'value == undefined', 'null', true ],
            [ 'value == "0"', 'false', true ],
            [ 'value == false', '0n', true ],
            [ 'value == 9007199254740993n', '"9007199254740993"', true ]
        ] as const
    ) {
        test(`replaces the public result of ${expression} with argument ${argument}`, function () {
            assertExpressionEvaluation({
                name: expression,
                content: `function compute(value){return ${expression};}export const value=compute(${argument});`,
                result: { value }
            });
        });
    }

    for (const argument of [ 'Symbol("key")', '{toString(){console.log("coerce");return "value";}}' ]) {
        test(`retains coercion effects and exceptions for ${argument}`, function () {
            assertExpressionEvaluation({
                name: argument,
                content: 'function compute(value){return "prefix"+value;}' +
                    `export const value=compute(${argument});`,
                result: undefined
            });
        });
    }

    test('preserves the sign of an exponentiation result of negative zero', function () {
        assertExpressionEvaluation({
            name: 'negative zero exponentiation',
            content: 'function compute(value){return value**3;}export const value=compute(-0);',
            result: { value: -0 }
        });
    });
});
