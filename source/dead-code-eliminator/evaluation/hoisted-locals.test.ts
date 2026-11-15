import assert from 'node:assert';
import { suite, test } from 'mocha';
import { SyntaxKind } from 'ts-morph';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { createBoundedEvaluationContext } from '../../test-libraries/bounded-evaluation-context.ts';
import { initializeHoistedLocals } from './hoisted-locals.ts';

suite('function-local hoisting', function () {
    test('initializes only var bindings owned by this invocation', function () {
        const content = 'function compute(){var first=42;let lexical=1;{var second;}' +
            'function nested(){var inside=2;}class Local{static{var staticValue=3;}}}';
        const source = createProject().createSourceFile('input.ts', content);
        const target = source.getFunctionOrThrow('compute');
        const context = createBoundedEvaluationContext(0, 100);
        assert.strictEqual(initializeHoistedLocals(target, context), true);
        for (const declaration of target.getDescendantsOfKind(SyntaxKind.VariableDeclaration)) {
            const name = declaration.getName();
            const reference = context.locals.get(declaration);
            assert.deepStrictEqual(
                reference?.value,
                [ 'first', 'second' ].includes(name) ? { value: undefined } : undefined,
                name
            );
        }
    });

    for (
        const [ content, expected ] of [
            [ 'declare function compute():void;', true ],
            [ 'function compute(){var arguments;}', false ],
            [ 'function compute(){var {value}={value:42};}', false ],
            [ 'function compute(){var value=1;var value=2;}', false ]
        ] as const
    ) {
        test(`checks hoisting prerequisites in ${content}`, function () {
            const source = createProject().createSourceFile('input.ts', content);
            assert.strictEqual(
                initializeHoistedLocals(source.getFunctionOrThrow('compute'), createBoundedEvaluationContext(0, 100)),
                expected
            );
        });
    }
});
