import assert from 'node:assert';
import { suite, test } from 'mocha';
import { SyntaxKind } from 'ts-morph';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { assertDefined } from '../../test-libraries/deep-subset-assertion.ts';
import { createPureCallResolver } from './pure-local-call.ts';

suite('pure local call resolution', function () {
    for (
        const [ content, expected ] of [
            [ 'function identity(value){return value;}identity(input);', 'identity' ],
            [ 'function identity(this:unknown,value:unknown){return value;}identity(input);', 'identity' ],
            [ 'function first(left,right){return left;}first(input);', 'arguments' ],
            [ 'function identity(value){return value;}identity();', 'arguments' ],
            [ 'function identity(value){return value;}identity(input,other);', 'arguments' ],
            [ 'function empty(){return 42;}empty();', 'arguments' ],
            [ 'function empty(){return 42;}empty(input);', 'arguments' ],
            [ 'function box(value){return {value};}box(input);', 'arguments' ],
            [ 'function collect(...values){return values;}collect(input);', 'arguments' ],
            [ 'function identity(value){return value;function value(){}}identity(input);', 'arguments' ],
            [ '/*@__PURE__*/unknown(input);', 'arguments' ],
            [ '/*@__PURE__*/new Constructor(input);', 'arguments' ],
            [ 'unknown(input);', 'unknown' ],
            [ 'new Constructor(input);', 'unknown' ],
            [ 'function compute(value){effect();return value;}compute(input);', 'unknown' ],
            [ '/*@__PURE__*/unknown(...input);', 'unknown' ],
            [ 'function compute(value){effect();return value;}/*@__PURE__*/compute(input);', 'arguments' ]
        ] as const
    ) {
        test(`preserves argument evaluation for ${content}`, function () {
            const source = createProject().createSourceFile('input.ts', content);
            const statement = source.getStatements().at(-1);
            assertDefined(statement);
            const expression = statement.asKindOrThrow(SyntaxKind.ExpressionStatement).getExpression();
            const call = expression.asKind(SyntaxKind.CallExpression) ??
                expression.asKindOrThrow(SyntaxKind.NewExpression);
            const result = createPureCallResolver(source)(call);
            if (expected === 'unknown') {
                assert.strictEqual(result, undefined);
            } else {
                assert.deepStrictEqual(result, {
                    arguments: call.getArguments(),
                    returnedArgument: expected === 'identity' ? call.getArguments()[0] : undefined
                });
                assert.strictEqual(
                    result.returnedArgument,
                    expected === 'identity' ? call.getArguments()[0] : undefined
                );
            }
        });
    }
});
