import assert from 'node:assert';
import { suite, test } from 'mocha';
import { variableInitializer } from '../pure-expression-test-support.ts';
import { createUnusedValueResolver } from './unused-value-effects.ts';

suite('unused value effects', function () {
    for (
        const [ expression, expected ] of [
            [ '(effect(),42)', [ 'effect()' ] ],
            [ '(1,first(),2,second(),3)', [ 'first()', 'second()' ] ],
            [ 'new(class{static [1+1](){}})(effect())', [ 'effect()' ] ],
            [ 'new(class{static ["prototype"](){}})(effect())', [ 'class{static ["prototype"](){}}', 'effect()' ] ],
            [ 'new(class{static [missing](){}})(effect())', [ 'class{static [missing](){}}', 'effect()' ] ],
            [ 'missing.value', undefined ]
        ] as const
    ) {
        test(`retains ordered effects from ${expression}`, function () {
            const value = variableInitializer(`const unused=${expression};export{};`, 'unused');
            const effects = createUnusedValueResolver(value.getSourceFile())(value);
            assert.deepStrictEqual(
                effects?.map(function (effect) {
                    return effect.getText();
                }),
                expected
            );
        });
    }
});
