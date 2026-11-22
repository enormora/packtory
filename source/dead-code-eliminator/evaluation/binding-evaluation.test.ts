import assert from 'node:assert';
import { suite, test } from 'mocha';
import { SyntaxKind } from 'ts-morph';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { createBoundedEvaluationContext } from '../../test-libraries/bounded-evaluation-context.ts';
import { assertDefined } from '../../test-libraries/deep-subset-assertion.ts';
import { maximumEvaluationDepth } from './evaluation-context.ts';
import { initializeLocalBinding } from './binding-evaluation.ts';

suite('local binding evaluation bounds', function () {
    for (
        const [ content, depth, expected ] of [
            [ 'const {value}={value:void 0};', 0, true ],
            [ 'const {value}={};', 0, false ],
            [ 'const {...rest}={rest:42};', 0, false ],
            [ 'const {value}={value:42};', maximumEvaluationDepth - 1, false ]
        ] as const
    ) {
        test(`initializes only selected own properties at depth ${depth} in ${content}`, function () {
            const source = createProject().createSourceFile('input.js', content);
            const declaration = source.getFirstDescendantByKindOrThrow(SyntaxKind.VariableDeclaration);
            const context = createBoundedEvaluationContext(0, 100);
            const value = context.evaluate(declaration.getInitializerOrThrow(), context);
            assertDefined(value);
            assert.strictEqual(initializeLocalBinding(declaration, value, false, { ...context, depth }), expected);
        });
    }

    test('does not read a property when its computed key is unknown', function () {
        const source = createProject().createSourceFile('input.js', 'const {[missing]:value}=record;');
        const declaration = source.getFirstDescendantByKindOrThrow(SyntaxKind.VariableDeclaration);
        assert.strictEqual(
            initializeLocalBinding(
                declaration,
                {
                    value: {
                        propertyReference() {
                            assert.fail('An unknown key cannot select an own property');
                        }
                    }
                },
                false,
                createBoundedEvaluationContext(0, 100)
            ),
            false
        );
    });
    for (const [ depth, fuel ] of [ [ maximumEvaluationDepth, 100 ], [ 0, 0 ] ] as const) {
        test(`rejects binding initialization at depth ${depth} with ${fuel} steps`, function () {
            const source = createProject().createSourceFile('index.ts', 'const value=42;');
            const declaration = source.getVariableDeclarationOrThrow('value');
            const context = createBoundedEvaluationContext(depth, fuel);
            assert.strictEqual(initializeLocalBinding(declaration, { value: 42 }, false, context), false);
            assert.strictEqual(context.locals.get(declaration), undefined);
        });
    }

    for (const writable of [ true, false ]) {
        test(`retains binding mutability ${writable}`, function () {
            const source = createProject().createSourceFile('index.ts', 'let value=21;');
            const declaration = source.getVariableDeclarationOrThrow('value');
            const context = createBoundedEvaluationContext(0, 100);
            assert.strictEqual(initializeLocalBinding(declaration, { value: 21 }, writable, context), true);
            const reference = context.locals.get(declaration);
            assertDefined(reference);
            assert.deepStrictEqual(reference.assign({ value: 42 }), writable ? { value: 42 } : undefined);
            assert.deepStrictEqual(reference.value, { value: writable ? 42 : 21 });
        });
    }

    for (const pattern of [ '{value}', '[value]' ]) {
        test(`does not infer primitive destructuring values for ${pattern}`, function () {
            const source = createProject().createSourceFile('index.ts', `const ${pattern}=42;`);
            const declaration = source.getFirstDescendantByKindOrThrow(SyntaxKind.VariableDeclaration);
            assert.strictEqual(
                initializeLocalBinding(declaration, { value: 42 }, false, createBoundedEvaluationContext(0, 100)),
                false
            );
        });
    }
});
