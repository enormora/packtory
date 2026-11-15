import assert from 'node:assert';
import { suite, test } from 'mocha';
import { isPureExpression } from '../test-libraries/expression-purity-test-support.ts';
import { variableInitializer } from './pure-expression-test-support.ts';

suite('literal creation purity', function () {
    for (
        const [ expression, expected ] of [
            [ '[]', true ],
            [ '[,]', true ],
            [ '[1,missing]', false ],
            [ '({...{value:42}})', true ],
            [ '({...{get value(){effect();return 42;}}})', false ],
            [ '({set value(value){effect(value);}})', true ],
            [ 'class{}', true ],
            [ 'class{constructor(){effect();}}', true ],
            [ 'class{static value=effect();}', false ],
            [ '!({})', true ],
            [ '+1', true ],
            [ '+({})', false ]
        ] as const
    ) {
        test(`classifies ${expression}`, function () {
            assert.strictEqual(
                isPureExpression(variableInitializer(`const value=${expression};`, 'value'), undefined),
                expected
            );
        });
    }

    test('requires explicit constructor trust when settings omit constructor names', function () {
        const initializer = variableInitializer('const value=new Untrusted();', 'value');
        assert.strictEqual(isPureExpression(initializer, { enabled: true }), false);
    });
});
