import assert from 'node:assert';
import { suite, test } from 'mocha';
import { SyntaxKind } from 'ts-morph';
import { createProject } from '../test-libraries/typescript-project.ts';
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
