import assert from 'node:assert';
import { suite, test } from 'mocha';
import { classify } from '../test-libraries/side-effect-classifier-test-support.ts';

suite('side-effect-classifier variable initializers', function () {
    suite('side-effect-classifier literal initializers', function () {
        test('treats a const with a literal initializer as pure', function () {
            assert.deepStrictEqual(classify('const x = 1;'), []);
        });

        test('treats a const with a string initializer as pure', function () {
            assert.deepStrictEqual(classify('const x = "hello";'), []);
        });

        test('treats a const with a template literal of pure interpolations as pure', function () {
            // eslint-disable-next-line no-template-curly-in-string -- template literal embedded in source-under-test
            assert.deepStrictEqual(classify('const x = `hello ${1 + 2}`;'), []);
        });

        test('treats a const with a template literal containing a call as impure', function () {
            // eslint-disable-next-line no-template-curly-in-string -- template literal embedded in source-under-test
            assert.deepStrictEqual(classify('const x = `hello ${compute()}`;'), [
                { line: 1, kind: 'variable initializer' }
            ]);
        });

        test('treats a const with a template literal mixing pure and impure spans as impure', function () {
            // eslint-disable-next-line no-template-curly-in-string -- template literal embedded in source-under-test
            assert.deepStrictEqual(classify('const x = `pure ${1} mixed ${compute()}`;'), [
                { line: 1, kind: 'variable initializer' }
            ]);
        });

        test('treats a const with a function expression as pure', function () {
            assert.deepStrictEqual(classify('const x = function () { return 1; };'), []);
        });

        test('treats a const with an arrow function as pure', function () {
            assert.deepStrictEqual(classify('const x = () => 1;'), []);
        });
    });

    suite('side-effect-classifier array initializers', function () {
        test('treats a const with a class expression as pure', function () {
            assert.deepStrictEqual(classify('const x = class { method() {} };'), []);
        });

        test('treats a const with an array literal of pure values as pure', function () {
            assert.deepStrictEqual(classify('const x = [1, 2, "three", () => 4];'), []);
        });

        test('treats a const with a sparse array literal as pure', function () {
            assert.deepStrictEqual(classify('const x = [1, , 3];'), []);
        });

        test('treats a const with an array literal containing a call as impure', function () {
            assert.deepStrictEqual(classify('const x = [compute()];'), [ { line: 1, kind: 'variable initializer' } ]);
        });

        test('treats a const with an array literal mixing pure and impure elements as impure', function () {
            assert.deepStrictEqual(classify('const x = [1, compute()];'), [ {
                line: 1,
                kind: 'variable initializer'
            } ]);
        });

        test('treats a const with a spread of an array literal as pure', function () {
            assert.deepStrictEqual(classify('const x = [...[1, 2]];'), []);
        });

        test('treats a const with a spread of a call expression as impure', function () {
            assert.deepStrictEqual(classify('const x = [...compute()];'), [ {
                line: 1,
                kind: 'variable initializer'
            } ]);
        });
    });

    suite('side-effect-classifier object initializers', function () {
        test('treats a const with an object literal of pure properties as pure', function () {
            assert.deepStrictEqual(classify('const x = { a: 1, b: "two", c: () => 3 };'), []);
        });

        test('treats a const with an object literal whose value is a call as impure', function () {
            assert.deepStrictEqual(classify('const x = { a: compute() };'), [ {
                line: 1,
                kind: 'variable initializer'
            } ]);
        });

        test('treats a const with an object literal mixing pure and impure properties as impure', function () {
            assert.deepStrictEqual(classify('const x = { a: 1, b: compute() };'), [
                { line: 1, kind: 'variable initializer' }
            ]);
        });

        test('treats a const with an object spread of a pure literal as pure', function () {
            assert.deepStrictEqual(classify('const x = { ...{ a: 1 } };'), []);
        });

        test('treats a const with an object shorthand reference as pure', function () {
            assert.deepStrictEqual(classify('const a = 1; const x = { a };'), []);
        });

        test('treats a const with an object method as pure', function () {
            assert.deepStrictEqual(classify('const x = { method() { return 1; } };'), []);
        });

        test('treats a const with an object getter as pure', function () {
            assert.deepStrictEqual(classify('const x = { get prop() { return 1; } };'), []);
        });
    });

    suite('side-effect-classifier syntax wrapper initializers', function () {
        test('treats a const with an "as" cast wrapping a pure expression as pure', function () {
            assert.deepStrictEqual(classify('const x = 1 as number;'), []);
        });

        test('treats a const with a "satisfies" wrapping a pure expression as pure', function () {
            assert.deepStrictEqual(classify('const x = 1 satisfies number;'), []);
        });

        test('treats a const with a legacy angle-bracket type assertion of a pure expression as pure', function () {
            assert.deepStrictEqual(classify('const x = <number>1;'), []);
        });

        test('treats a const with a parenthesized pure expression as pure', function () {
            assert.deepStrictEqual(classify('const x = (1 + 2);'), []);
        });

        test('treats a const with a non-null assertion of a pure expression as pure', function () {
            assert.deepStrictEqual(classify('const a = 1; const x = a!;'), []);
        });

        test('treats a const with a unary minus on a pure operand as pure', function () {
            assert.deepStrictEqual(classify('const x = -5;'), []);
        });

        test('treats a const with a logical not on a pure operand as pure', function () {
            assert.deepStrictEqual(classify('const x = !false;'), []);
        });
    });

    suite('side-effect-classifier expression initializers', function () {
        test('treats a const with an unsupported prefix unary operator as impure', function () {
            assert.deepStrictEqual(classify('let a = 1; const x = ++a;'), [ {
                line: 1,
                kind: 'variable initializer'
            } ]);
        });

        test('treats a const with an arithmetic binary expression of pure operands as pure', function () {
            assert.deepStrictEqual(classify('const x = 1 + 2 * 3;'), []);
        });

        test('treats a const with a logical binary of pure operands as pure', function () {
            assert.deepStrictEqual(classify('const x = true && false;'), []);
        });

        test('treats a const with a strict equality binary as pure', function () {
            assert.deepStrictEqual(classify('const x = 1 === 1;'), []);
        });

        test('treats a const with a loose equality binary as impure', function () {
            assert.deepStrictEqual(classify('const x = 1 == 1;'), [ { line: 1, kind: 'variable initializer' } ]);
        });

        test('treats a const with a binary expression containing a call as impure', function () {
            assert.deepStrictEqual(classify('const x = 1 + compute();'), [ { line: 1, kind: 'variable initializer' } ]);
        });

        test('treats a const with an identifier reference as pure', function () {
            assert.deepStrictEqual(classify('const a = 1; const x = a;'), []);
        });

        test('treats a const with a property access as impure', function () {
            assert.deepStrictEqual(classify('declare const obj: { x: number }; const x = obj.x;'), [
                { line: 1, kind: 'variable initializer' }
            ]);
        });
    });
});
