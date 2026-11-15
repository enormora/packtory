import assert from 'node:assert';
import { suite, test } from 'mocha';
import { isPureExpression } from '../test-libraries/expression-purity-test-support.ts';
import { variableInitializer } from './pure-expression-test-support.ts';

suite('call purity annotations', function () {
    for (
        const expression of [
            '/*#__PURE__*/globalThis.compute()',
            '/*@__PURE__*/globalThis.compute()',
            '// @__PURE__\nglobalThis.compute()'
        ]
    ) {
        test(`recognizes a leading annotation in ${expression}`, function () {
            const initializer = variableInitializer(`const unused=${expression};`, 'unused');
            assert.strictEqual(isPureExpression(initializer, undefined), true);
        });
    }

    for (
        const expression of [
            'globalThis.effect("/*#__PURE__*/")',
            'globalThis.effect(42 /*@__PURE__*/)',
            'globalThis.effect(()=>{/*#__PURE__*/globalThis.compute();})',
            'globalThis.effect(/*#__PURE__*/globalThis.compute())',
            '/*__PURE__*/globalThis.compute()',
            '/*#__PURE_*/globalThis.compute()',
            '/*#__PUR__*/globalThis.compute()',
            '/*#PURE__*/globalThis.compute()',
            '/*#__PURE*/globalThis.compute()'
        ]
    ) {
        test(`rejects invalid annotation text in ${expression}`, function () {
            const initializer = variableInitializer(`const unused=${expression};`, 'unused');
            assert.strictEqual(isPureExpression(initializer, undefined), false);
        });
    }
});
