import { suite, test } from 'mocha';
import { assertSingleFileCallReduction } from '../test-libraries/dead-code-elimination-single-file-case.ts';

suite('primitive operator elimination', function () {
    for (
        const [ expression, argument ] of [
            [ 'value & 3', '7' ],
            [ 'value | 3', '4' ],
            [ 'value ^ 3', '7' ],
            [ 'value << 33', '1' ],
            [ 'value >> 1', '8' ],
            [ 'value >>> 1', '-1' ],
            [ 'value ** 4', '2' ],
            [ '~value', '1' ],
            [ '"prefix" + value', '21' ],
            [ 'value + "suffix"', '21n' ],
            [ 'value ^ 1', '(0/0)' ],
            [ 'value >>> 0', '-3.9' ],
            [ 'value + 1', 'null' ],
            [ 'value + 1', 'true' ],
            [ 'value - 1', '"2"' ],
            [ 'value > "a"', '"b"' ],
            [ 'value < "2"', '"10"' ],
            [ 'value < 2n', '1' ],
            [ 'value < "2"', '1n' ],
            [ 'value < "9007199254740993"', '9007199254740992n' ],
            [ 'value == 1', 'true' ],
            [ 'value == 1', '"1"' ],
            [ 'value == undefined', 'null' ],
            [ 'value == "0"', 'false' ],
            [ 'value == false', '0n' ],
            [ 'value == 9007199254740993n', '"9007199254740993"' ]
        ]
    ) {
        test(`replaces the public result of ${expression} with argument ${argument}`, async function () {
            await assertSingleFileCallReduction({
                content: `function compute(value){return ${expression};}` +
                    `export function probe(){return compute(${argument});}`,
                targetFilePath: 'index.js',
                callee: 'compute',
                remainingCalls: 0
            });
        });
    }

    for (const argument of [ 'Symbol("key")', '{toString(){console.log("coerce");return "value";}}' ]) {
        test(`retains coercion effects and exceptions for ${argument}`, async function () {
            await assertSingleFileCallReduction({
                content: 'function compute(value){return "prefix"+value;}' +
                    `export function probe(){return compute(${argument});}`,
                targetFilePath: 'index.js',
                callee: 'compute',
                remainingCalls: 1
            });
        });
    }

    test('preserves the sign of an exponentiation result of negative zero', async function () {
        await assertSingleFileCallReduction({
            content:
                'function compute(value){return value**3;}export function probe(){return Object.is(compute(-0),-0);}',
            targetFilePath: 'index.js',
            callee: 'compute',
            remainingCalls: 0
        });
    });
});
