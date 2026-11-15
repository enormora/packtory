import assert from 'node:assert';
import { suite, test } from 'mocha';
import { SyntaxKind } from 'ts-morph';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { createBoundedEvaluationContext } from '../../test-libraries/bounded-evaluation-context.ts';
import { evaluateStatement } from './statement-evaluation.ts';
import { createBindingReference } from './evaluation-context.ts';
import { evaluated } from './primitive-value.ts';

suite('return completion proofs', function () {
    for (
        const [ content, kind ] of [
            [ 'break target;', SyntaxKind.BreakStatement ],
            [ 'continue target;', SyntaxKind.ContinueStatement ]
        ] as const
    ) {
        test(`retains unresolved control labels in ${content}`, function () {
            const source = createProject().createSourceFile('index.ts', content);
            assert.strictEqual(
                evaluateStatement(source.getFirstDescendantByKindOrThrow(kind), createBoundedEvaluationContext(0, 100)),
                undefined
            );
        });
    }

    test('preserves the binding when a var initializer cannot be evaluated', function () {
        const source = createProject().createSourceFile('index.ts', 'var value=missing;');
        const statement = source.getFirstDescendantByKindOrThrow(SyntaxKind.VariableStatement);
        const declaration = source.getVariableDeclarationOrThrow('value');
        const context = createBoundedEvaluationContext(0, 100);
        const reference = createBindingReference(evaluated(1), true);
        context.locals.set(declaration, reference);
        assert.strictEqual(evaluateStatement(statement, context), undefined);
        assert.deepStrictEqual(reference.value, { value: 1 });
    });

    test('requires a hoisted binding before initializing var', function () {
        const source = createProject().createSourceFile('index.ts', 'var value=42;');
        const statement = source.getFirstDescendantByKindOrThrow(SyntaxKind.VariableStatement);
        assert.strictEqual(evaluateStatement(statement, createBoundedEvaluationContext(0, 100)), undefined);
    });

    test('rejects initialization of an immutable binding', function () {
        const source = createProject().createSourceFile('index.ts', 'var value=42;');
        const statement = source.getFirstDescendantByKindOrThrow(SyntaxKind.VariableStatement);
        const declaration = source.getVariableDeclarationOrThrow('value');
        const context = createBoundedEvaluationContext(0, 100);
        const reference = createBindingReference(evaluated(1), false);
        context.locals.set(declaration, reference);
        assert.strictEqual(evaluateStatement(statement, context), undefined);
        assert.deepStrictEqual(reference.value, { value: 1 });
    });

    test('rejects an unknown return value rather than completing with it', function () {
        const source = createProject().createSourceFile('index.ts', 'function run(){return missing;}');
        const statement = source.getFirstDescendantByKindOrThrow(SyntaxKind.ReturnStatement);
        assert.strictEqual(evaluateStatement(statement, createBoundedEvaluationContext(0, 100)), undefined);
    });
});
