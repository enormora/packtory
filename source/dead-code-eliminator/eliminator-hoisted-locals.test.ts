import assert from 'node:assert';
import { suite, test } from 'mocha';
import { SyntaxKind } from 'ts-morph';
import { eliminateEntryModule } from '../test-libraries/eliminator-test-support.ts';
import { assertExpressionEvaluation } from '../test-libraries/expression-evaluation-case.ts';
import { withSource } from '../test-libraries/transform-test-support.ts';
import { createSourceEvaluation } from './evaluation/constant-evaluation.ts';

suite('function-local variable evaluation', function () {
    for (
        const [ body, value ] of [
            [ 'var value=42;return value;', 42 ],
            [ 'var sum=0;for(var index=0;index<3;index++)sum+=index;return sum;', 3 ],
            [ 'value=42;var value;return value;', 42 ],
            [ 'if(false){var value=1;}return value;', undefined ],
            [ '{var value=42;}return value;', 42 ],
            [ 'var value;{value=42;}return value;', 42 ],
            [ ';var value=42;;return value;', 42 ],
            [ 'do{}while(false);return 42;', 42 ],
            [ 'var initial=value;var value=42;return initial;', undefined ]
        ] as const
    ) {
        test(`folds ${body}`, function () {
            assertExpressionEvaluation({
                name: body,
                content: `function compute(){${body}}export const value=compute();`,
                result: { value }
            });
        });
    }

    for (
        const [ parameters, body, argument ] of [
            [ '', 'var arguments;return arguments[0];', '42' ],
            [ 'value', 'var value;return value;', '42' ],
            [ '', 'var value=1;var value;return value;', '' ],
            [ '', 'return value;{let value=42;}', '' ],
            [ '', 'return value;function nested(){var value=42;}', '' ],
            [ '', 'class Local{static{var value=42;}}return value;', '' ],
            [ '', 'var {value}={get value(){console.log("read");return 42;}};return value;', '' ],
            [ '', 'var value=console.log("effect");return value;', '' ]
        ] as const
    ) {
        test(`retains unproven scope or effects in ${body}`, function () {
            assertExpressionEvaluation({
                name: body,
                content: `function compute(${parameters}){${body}}export const value=compute(${argument});`,
                result: undefined
            });
        });
    }

    test('folds a hoisted local assignment through the DCE pipeline', async function () {
        const source = withSource(
            await eliminateEntryModule(
                'function compute(){value=42;var value;return value;}export const value=compute();'
            )
        );
        const value = source.getVariableDeclarationOrThrow('value').getInitializerOrThrow();
        assert.deepStrictEqual(createSourceEvaluation(source).primitiveValue(value), { value: 42 });
        assert.strictEqual(source.getFunction('compute'), undefined);
        assert.deepStrictEqual(source.getDescendantsOfKind(SyntaxKind.CallExpression), []);
    });
});
