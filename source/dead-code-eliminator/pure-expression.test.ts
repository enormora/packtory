import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { DeadCodeEliminationSettings } from '../config/dead-code-elimination-settings.ts';
import { firstVariableInitializerExpression } from '../test-libraries/first-variable-initializer-expression.ts';
import { isPureExpression } from './pure-expression.ts';

suite('pure-expression', function () {
    suite('literal and expression purity', function () {
        test('isPureExpression returns true for a primitive literal', function () {
            assert.strictEqual(isPureExpression(firstVariableInitializerExpression('const a = 1;'), undefined), true);
        });

        test('isPureExpression returns true for a function expression', function () {
            assert.strictEqual(
                isPureExpression(firstVariableInitializerExpression('const a = function () {};'), undefined),
                true
            );
        });

        test('isPureExpression returns true for an array literal of pure elements', function () {
            assert.strictEqual(
                isPureExpression(firstVariableInitializerExpression('const a = [1, "x", true];'), undefined),
                true
            );
        });

        test('isPureExpression returns false for an array literal containing a non-pure call', function () {
            assert.strictEqual(
                isPureExpression(firstVariableInitializerExpression('const a = [Math.random()];'), undefined),
                false
            );
        });

        test('isPureExpression returns true for an object literal of pure assignments', function () {
            assert.strictEqual(
                isPureExpression(
                    firstVariableInitializerExpression('const a = { x: 1, get y() { return 2; } };'),
                    undefined
                ),
                true
            );
        });

        test('isPureExpression returns true for a strict-equality binary expression of pure operands', function () {
            assert.strictEqual(
                isPureExpression(firstVariableInitializerExpression('const a = 1 === 2;'), undefined),
                true
            );
        });

        test('isPureExpression returns false for a binary expression with a disallowed operator', function () {
            assert.strictEqual(
                isPureExpression(firstVariableInitializerExpression('const a = 1 == 2;'), undefined),
                false
            );
        });

        test('isPureExpression returns false for a call expression to an unknown function', function () {
            assert.strictEqual(
                isPureExpression(
                    firstVariableInitializerExpression('declare const f: () => number;\nconst a = f();'),
                    undefined
                ),
                false
            );
        });
    });

    suite('trusted import purity', function () {
        test('isPureExpression returns true for a call to a function imported from a trusted pureImports entry', function () {
            const settings: DeadCodeEliminationSettings = { enabled: true, pureImports: [ { from: 'lib' } ] };
            const expression = firstVariableInitializerExpression('import { x } from "lib";\nconst a = x();');

            assert.strictEqual(isPureExpression(expression, settings), true);
        });

        test('isPureExpression matches trusted imports against the imported property path head', function () {
            const settings: DeadCodeEliminationSettings = {
                enabled: true,
                pureImports: [ { from: 'lib', imports: [ 'x' ] } ]
            };
            const expression = firstVariableInitializerExpression('import * as ns from "lib";\nconst a = ns.x.y();');

            assert.strictEqual(isPureExpression(expression, settings), true);
        });

        test('isPureExpression returns true for a Symbol call with pure arguments', function () {
            const expression = firstVariableInitializerExpression('const a = Symbol("x");');

            assert.strictEqual(isPureExpression(expression, undefined), true);
        });

        test('isPureExpression returns false for a Symbol call with an impure argument', function () {
            const expression = firstVariableInitializerExpression(
                'declare const f: () => string;\nconst a = Symbol(f());'
            );

            assert.strictEqual(isPureExpression(expression, undefined), false);
        });

        test('isPureExpression returns true for a new expression of a trusted pureConstructor name', function () {
            const settings: DeadCodeEliminationSettings = { enabled: true, pureConstructors: [ 'Foo' ] };
            const expression = firstVariableInitializerExpression('declare class Foo {}\nconst a = new Foo();');

            assert.strictEqual(isPureExpression(expression, settings), true);
        });

        test('isPureExpression returns false for a new expression whose constructor name is not on the trusted list', function () {
            const settings: DeadCodeEliminationSettings = { enabled: true, pureConstructors: [ 'Foo' ] };
            const expression = firstVariableInitializerExpression('declare class Bar {}\nconst a = new Bar();');

            assert.strictEqual(isPureExpression(expression, settings), false);
        });
    });
});
