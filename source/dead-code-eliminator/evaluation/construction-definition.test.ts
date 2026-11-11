import assert from 'node:assert';
import { suite, test } from 'mocha';
import { variableInitializer } from '../pure-expression-test-support.ts';
import { createSourceEvaluation } from './constant-evaluation.ts';

suite('class definition evaluation', function () {
    for (
        const [ expression, expected ] of [
            [ 'typeof new(class{["prototype"](){}})', 'object' ],
            [ 'typeof new(class{static ["value"](){}})', 'object' ],
            [ 'typeof new(class{static value;})', 'object' ],
            [ 'typeof new(class{static ["value"]=1;})', 'object' ],
            [ 'typeof new(class{})(42)', 'object' ],
            [ '(function(){let x=0;new(class{})(x=42);return x;})()', 42 ],
            [ '(function(){let x=1;new(class{static first=x+=1;[x*=2](){}});return x;})()', 3 ]
        ] as const
    ) {
        test(`evaluates ${expression}`, function () {
            const initializer = variableInitializer(`const result=${expression};export {};`, 'result');
            assert.deepStrictEqual(createSourceEvaluation(initializer.getSourceFile()).primitiveValue(initializer), {
                value: expected
            });
        });
    }

    for (const depth of [ 32, 33 ]) {
        test(`bounds construction argument evaluation at depth ${String(depth)}`, function () {
            const expression = `${'new Empty('.repeat(depth)}0${')'.repeat(depth)}`;
            const initializer = variableInitializer(
                `class Empty{}const result=typeof ${expression};export {};`,
                'result'
            );
            assert.deepStrictEqual(
                createSourceEvaluation(initializer.getSourceFile()).primitiveValue(initializer),
                depth === 32 ? { value: 'object' } : undefined
            );
        });
    }
});
