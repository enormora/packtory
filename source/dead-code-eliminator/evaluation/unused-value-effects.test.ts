import assert from 'node:assert';
import { suite, test } from 'mocha';
import { variableInitializer } from '../pure-expression-test-support.ts';
import { createExpressionPurityChecker } from '../pure-expression.ts';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { createUnusedValueResolver } from './unused-value-effects.ts';

suite('unused value effects', function () {
    const isPure = createExpressionPurityChecker(undefined, function () {
        return undefined;
    });

    test('distinguishes empty class effects from an unknown class initializer', function () {
        const source = createProject().createSourceFile('input.ts', 'class Empty{}class Required{static{effect();}}');
        const resolve = createUnusedValueResolver(source, isPure);
        assert.deepStrictEqual(resolve(source.getClassOrThrow('Empty')), []);
        assert.strictEqual(resolve(source.getClassOrThrow('Required')), undefined);
    });
    for (
        const [ expression, expected ] of [
            [ '(effect(),42)', [ 'effect()' ] ],
            [ 'void effect()', [ 'effect()' ] ],
            [ '!effect()', [ 'effect()' ] ],
            [ '+effect()', undefined ],
            [ 'typeof missing', undefined ],
            [ 'effect()&&false', [ 'effect()' ] ],
            [ 'effect()||true', [ 'effect()' ] ],
            [ 'effect()??42', [ 'effect()' ] ],
            [ 'effect()&&missing', undefined ],
            [ 'effect()||missing', undefined ],
            [ 'effect()??missing', undefined ],
            [ 'effect()+false', undefined ],
            [ '(1,first(),2,second(),3)', [ 'first()', 'second()' ] ],
            [ 'new(class{static [1+1](){}})(effect())', [ 'effect()' ] ],
            [ 'new(class{static ["prototype"](){}})(effect())', [ 'class{static ["prototype"](){}}', 'effect()' ] ],
            [ 'new(class{static [missing](){}})(effect())', [ 'class{static [missing](){}}', 'effect()' ] ],
            [ 'missing.value', undefined ],
            [ 'new Unknown()', undefined ],
            [ 'new(class{static value=effect();})()', [ 'class{static value=effect();}' ] ],
            [ '({unused:42,effect:first(),nested:{unused:1,effect:second()}})', [ 'first()', 'second()' ] ],
            [ '({get unused(){effect();},method(){effect();},effect:first()})', [ 'first()' ] ],
            [ '({[1+1]:effect()})', [ 'effect()' ] ],
            [ '({[unknown]:effect()})', undefined ],
            [ '({...unknown})', undefined ],
            [ '({unused:42,[unknown]:effect()})', [ '[unknown]:effect()' ] ],
            [ '({unused:42,...unknown})', [ '...unknown' ] ],
            [ '({...unknown,unused:42})', [ '...unknown' ] ],
            [ '({unknown})', [ 'unknown' ] ],
            [ '({__proto__:effect()})', [ 'effect()' ] ],
            [ '({named:class{static{effect(this.name);}}})', undefined ],
            [ '({unused:42,named:class{static{effect(this.name);}}})', [ 'named:class{static{effect(this.name);}}' ] ],
            [ '({unused:class{},value:effect()})', [ 'effect()' ] ],
            [ '(class{})', [] ],
            [ '/expression/', [] ],
            [ '/*#__PURE__*/globalThis.compute(1)', [] ]
        ] as const
    ) {
        test(`retains ordered effects from ${expression}`, function () {
            const value = variableInitializer(`const unused=${expression};export{};`, 'unused');
            const effects = createUnusedValueResolver(value.getSourceFile(), isPure)(value);
            assert.deepStrictEqual(
                effects?.map(function (effect) {
                    return effect.getText();
                }),
                expected
            );
        });
    }

    test('retains only arguments when constructing a named empty class', function () {
        const value = variableInitializer('class Empty{}const unused=new Empty(effect());export{};', 'unused');
        const effects = createUnusedValueResolver(value.getSourceFile(), isPure)(value);
        assert.deepStrictEqual(
            effects?.map(function (effect) {
                return effect.getText();
            }),
            [ 'effect()' ]
        );
    });
});
