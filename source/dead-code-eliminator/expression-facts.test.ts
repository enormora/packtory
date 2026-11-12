import assert from 'node:assert';
import { suite, test } from 'mocha';
import { SyntaxKind } from 'ts-morph';
import { createProject } from '../test-libraries/typescript-project.ts';
import { assertDefined } from '../test-libraries/deep-subset-assertion.ts';
import {
    classExpressionFact,
    expressionFactIsPure,
    identifierReadFact,
    localConstructionFact,
    pureCallableWithOrigin,
    pureValueFact,
    unknownFact
} from './expression-facts.ts';
import { resolveRuntimeModule } from './runtime-module-resolution.ts';

suite('expression facts', function () {
    suite('runtime declaration boundaries', function () {
        for (
            const content of [
                'for(const value of [1]){const observed=value;}',
                'for(let value=0;value<1;value++){const observed=value;}',
                'try{throw 1;}catch(value){const observed=value;}'
            ]
        ) {
            test(`classifies a binding without a variable statement in ${content}`, function () {
                const source = createProject().createSourceFile('input.ts', content);
                const read = source
                    .getDescendantsOfKind(SyntaxKind.VariableDeclaration)
                    .find(function (declaration) {
                        return declaration.getName() === 'observed';
                    })
                    ?.getInitializerOrThrow()
                    .asKindOrThrow(SyntaxKind.Identifier);
                assertDefined(read);
                assert.deepStrictEqual(
                    identifierReadFact(read, function () {
                        return unknownFact;
                    }, { settings: undefined, resolveRuntimeModule }),
                    pureValueFact
                );
            });
        }

        test('keeps instantiated namespace reads conservative', function () {
            const source = createProject().createSourceFile(
                'input.ts',
                'namespace value{export const used=1;}const observed=value;'
            );
            const read = source.getVariableDeclarationOrThrow('observed').getInitializerOrThrow().asKindOrThrow(
                SyntaxKind.Identifier
            );
            assert.deepStrictEqual(
                identifierReadFact(read, function () {
                    return unknownFact;
                }, { settings: undefined, resolveRuntimeModule }),
                unknownFact
            );
        });

        test('does not reuse callable import facts after mutating their shape', function () {
            const project = createProject({
                withFiles: [
                    { filePath: '/repo/package.json', content: '{"type":"module"}' },
                    {
                        filePath: '/repo/index.js',
                        content: 'import {value} from "./provider.js";value.member=1;const observed=value;'
                    },
                    { filePath: '/repo/provider.js', content: 'export function value(){return 1;}' }
                ]
            });
            const read = project
                .getSourceFileOrThrow('/repo/index.js')
                .getVariableDeclarationOrThrow('observed')
                .getInitializerOrThrow()
                .asKindOrThrow(SyntaxKind.Identifier);
            assert.deepStrictEqual(
                identifierReadFact(read, function () {
                    return unknownFact;
                }, { settings: undefined, resolveRuntimeModule }),
                pureValueFact
            );
        });
    });

    test('recognizes bounded local construction as a pure value', function () {
        const source = createProject().createSourceFile('input.ts', 'class Box{}const observed=new Box();export{};');
        const expression = source.getFirstDescendantByKindOrThrow(SyntaxKind.NewExpression);
        assert.deepStrictEqual(localConstructionFact(expression), pureValueFact);
    });

    test('resolves primitive computed class keys', function () {
        const source = createProject().createSourceFile(
            'input.ts',
            'const observed=class{["member"](){}};'
        );
        const expression = source.getFirstDescendantByKindOrThrow(SyntaxKind.ClassExpression);
        assert.deepStrictEqual(
            classExpressionFact(expression, function () {
                return pureValueFact;
            }, {
                settings: undefined,
                resolveRuntimeModule
            }),
            pureValueFact
        );
    });

    for (
        const content of [
            'const value=()=>1;value.member=2;const observed=value;',
            'const observed=value;class value{}',
            'namespace value{}const observed=value;',
            'const observed=undefined;const undefined=42;'
        ]
    ) {
        test(`keeps declaration and mutation boundaries for ${content}`, function () {
            const source = createProject().createSourceFile('input.ts', content);
            const read = source.getVariableDeclarationOrThrow('observed').getInitializerOrThrow().asKindOrThrow(
                SyntaxKind.Identifier
            );
            const fact = identifierReadFact(read, function () {
                return pureCallableWithOrigin({ from: 'library', path: [ 'value' ] });
            }, { settings: undefined, resolveRuntimeModule });
            assert.deepStrictEqual(fact, content.startsWith('const value=') ? pureValueFact : unknownFact);
        });
    }

    test('exported value facts keep their discriminants', function () {
        assert.deepStrictEqual(pureValueFact, { origin: undefined, type: 'pure-value' });
        assert.strictEqual(expressionFactIsPure(pureValueFact), true);
    });

    test('exported unknown facts keep their discriminants', function () {
        assert.deepStrictEqual(unknownFact, { origin: undefined, type: 'unknown' });
        assert.strictEqual(expressionFactIsPure(unknownFact), false);
    });

    test('does not infer a primitive type without an initializer', function () {
        const source = createProject().createSourceFile('input.ts', 'const value;const observed=value;');
        const read = source
            .getVariableDeclarationOrThrow('observed')
            .getInitializerOrThrow()
            .asKindOrThrow(SyntaxKind.Identifier);
        const fact = identifierReadFact(read, function () {
            return assert.fail('An absent initializer cannot supply an expression fact');
        }, {
            settings: undefined,
            resolveRuntimeModule() {
                return undefined;
            }
        });
        assert.deepStrictEqual(fact, pureValueFact);
    });
});
