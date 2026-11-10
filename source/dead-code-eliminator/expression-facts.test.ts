import assert from 'node:assert';
import { suite, test } from 'mocha';
import { SyntaxKind } from 'ts-morph';
import { createProject } from '../test-libraries/typescript-project.ts';
import { expressionFactIsPure, identifierReadFact, pureValueFact, unknownFact } from './expression-facts.ts';

suite('expression facts', function () {
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
