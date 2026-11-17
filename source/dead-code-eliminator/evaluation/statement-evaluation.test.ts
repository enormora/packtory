import assert from 'node:assert';
import { suite, test } from 'mocha';
import { SyntaxKind } from 'ts-morph';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { createBoundedEvaluationContext } from '../../test-libraries/bounded-evaluation-context.ts';
import { assertDefined } from '../../test-libraries/deep-subset-assertion.ts';
import { evaluateStatement } from './statement-evaluation.ts';
import { createBindingReference, type EvaluationContext } from './evaluation-context.ts';
import { evaluated } from './primitive-value.ts';

suite('return completion proofs', function () {
    test('does not evaluate a loop condition after exhausting its budget', function () {
        const source = createProject().createSourceFile('index.ts', 'while(true){}');
        const statement = source.getFirstDescendantByKindOrThrow(SyntaxKind.WhileStatement);
        const context = {
            ...createBoundedEvaluationContext(0, 1),
            evaluate() {
                assert.fail('The loop must charge a step before evaluating its condition');
            }
        };
        assert.strictEqual(evaluateStatement(statement, context), undefined);
    });
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

    suite('statement completion semantics', function () {
        for (const kind of [ 'const', 'let' ]) {
            test(`preserves ${kind} binding mutability`, function () {
                const source = createProject().createSourceFile('input.js', `${kind} value=21;`);
                const context = createBoundedEvaluationContext(0, 100);
                const statement = source.getFirstDescendantByKindOrThrow(SyntaxKind.VariableStatement);
                assert.deepStrictEqual(evaluateStatement(statement, context), { type: 'normal' });
                const reference = context.locals.get(source.getVariableDeclarationOrThrow('value'));
                assertDefined(reference);
                assert.deepStrictEqual(reference.assign({ value: 42 }), kind === 'let' ? { value: 42 } : undefined);
            });
        }

        test('initializes every declaration in a variable statement', function () {
            const source = createProject().createSourceFile('input.ts', 'let first=1,second=2;');
            const context = createBoundedEvaluationContext(0, 100);
            assert.deepStrictEqual(
                evaluateStatement(source.getFirstDescendantByKindOrThrow(SyntaxKind.VariableStatement), context),
                { type: 'normal' }
            );
            assert.deepStrictEqual(
                source.getVariableDeclarations().map(function (declaration) {
                    return context.locals.get(declaration)?.value;
                }),
                [ { value: 1 }, { value: 2 } ]
            );
        });

        for (
            const [ content, expected ] of [
                [ 'for(let i=0;i<3;i++){return 42;}', { type: 'return', value: { value: 42 } } ],
                [ 'while(true){return 42;}', { type: 'return', value: { value: 42 } } ],
                [ 'while(true){break;}', { type: 'normal' } ],
                [ 'for(let i=0;i<3;i++){continue;}', { type: 'normal' } ]
            ] as const
        ) {
            test(`propagates loop completion for ${content}`, function () {
                const source = createProject().createSourceFile('input.ts', `function compute(){${content}}`);
                const body = source.getFunctionOrThrow('compute').getBodyOrThrow().asKindOrThrow(SyntaxKind.Block);
                assert.deepStrictEqual(
                    evaluateStatement(body, createBoundedEvaluationContext(0, 100)),
                    expected
                );
            });
        }
    });

    suite('unknown statement boundaries', function () {
        for (const content of [ 'let value=missing;', 'using value=42;' ]) {
            test(`retains unresolved initialization in ${content}`, function () {
                const source = createProject().createSourceFile('input.ts', content);
                assert.strictEqual(
                    evaluateStatement(
                        source.getFirstDescendantByKindOrThrow(SyntaxKind.VariableStatement),
                        createBoundedEvaluationContext(0, 100)
                    ),
                    undefined
                );
            });
        }

        test('does not advance a loop after an unknown body', function () {
            const source = createProject().createSourceFile('input.ts', 'for(;true;increment())unknown();');
            const context: EvaluationContext = {
                ...createBoundedEvaluationContext(0, 100),
                evaluate(expression) {
                    if (expression.getText() === 'true') {
                        return { value: true };
                    }
                    assert.strictEqual(expression.getText(), 'unknown()');
                    return undefined;
                }
            };
            assert.strictEqual(
                evaluateStatement(source.getFirstDescendantByKindOrThrow(SyntaxKind.ForStatement), context),
                undefined
            );
        });

        test('does not read an unknown loop condition as a value', function () {
            const source = createProject().createSourceFile('input.ts', 'while(missing){}');
            assert.strictEqual(
                evaluateStatement(
                    source.getFirstDescendantByKindOrThrow(SyntaxKind.WhileStatement),
                    createBoundedEvaluationContext(0, 100)
                ),
                undefined
            );
        });
    });

    suite('unconditional loop completion', function () {
        test('allows a missing condition when the loop breaks', function () {
            const source = createProject().createSourceFile('input.ts', 'for(;;){break;}');
            assert.deepStrictEqual(
                evaluateStatement(
                    source.getFirstDescendantByKindOrThrow(SyntaxKind.ForStatement),
                    createBoundedEvaluationContext(0, 100)
                ),
                { type: 'normal' }
            );
        });
    });
});
