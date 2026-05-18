import assert from 'node:assert';
import { suite, test } from 'mocha';
import { SyntaxKind, type Expression } from 'ts-morph';
import { createProject } from '../test-libraries/typescript-project.ts';
import { unwrapExpression } from './expression-unwrapping.ts';

function firstInitializer(content: string): Expression {
    const project = createProject({ withFiles: [{ filePath: 'index.ts', content }] });
    const sourceFile = project.getSourceFileOrThrow('index.ts');
    const variableStatement = sourceFile.getFirstChildByKindOrThrow(SyntaxKind.VariableStatement);
    return variableStatement.getDeclarations()[0]!.getInitializerOrThrow();
}

suite('expression-unwrapping', function () {
    test('unwrapExpression returns the same node when there are no wrapping expressions', function () {
        const expression = firstInitializer('const a = 1;');

        assert.strictEqual(unwrapExpression(expression), expression);
    });

    test('unwrapExpression strips parenthesized expressions', function () {
        const result = unwrapExpression(firstInitializer('const a = (1);'));

        assert.strictEqual(result.getKind(), SyntaxKind.NumericLiteral);
    });

    test('unwrapExpression strips as expressions', function () {
        const result = unwrapExpression(firstInitializer('const a = 1 as number;'));

        assert.strictEqual(result.getKind(), SyntaxKind.NumericLiteral);
    });

    test('unwrapExpression strips satisfies expressions', function () {
        const result = unwrapExpression(firstInitializer('const a = 1 satisfies number;'));

        assert.strictEqual(result.getKind(), SyntaxKind.NumericLiteral);
    });

    test('unwrapExpression strips non-null assertions', function () {
        const result = unwrapExpression(firstInitializer('const a = (1 as number | undefined)!;'));

        assert.strictEqual(result.getKind(), SyntaxKind.NumericLiteral);
    });

    test('unwrapExpression strips multiple nested wrappers in a single pass', function () {
        const result = unwrapExpression(firstInitializer('const a = ((1 as number) satisfies number);'));

        assert.strictEqual(result.getKind(), SyntaxKind.NumericLiteral);
    });
});
