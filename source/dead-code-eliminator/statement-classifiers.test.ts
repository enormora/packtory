import assert from 'node:assert';
import { suite, test } from 'mocha';
import { SyntaxKind, type SourceFile, type Statement } from 'ts-morph';
import { createProject } from '../test-libraries/typescript-project.ts';
import { statementClassifierFor } from './statement-classifiers.ts';

function firstStatementOfKind(content: string, kind: SyntaxKind): Statement {
    const project = createProject({ withFiles: [{ filePath: 'index.ts', content }] });
    const sourceFile: SourceFile = project.getSourceFileOrThrow('index.ts');

    return sourceFile.getFirstChildByKindOrThrow(kind) as Statement;
}

suite('statement-classifiers', function () {
    test('statementClassifiers maps ImportDeclaration to a classifier that flags .css imports', function () {
        const classifier = statementClassifierFor(SyntaxKind.ImportDeclaration);
        const statement = firstStatementOfKind('import "./style.css";', SyntaxKind.ImportDeclaration);

        assert.strictEqual(classifier?.(statement, undefined), 'css import');
    });

    test('statementClassifiers maps ImportDeclaration to a classifier that returns undefined for non-css imports', function () {
        const classifier = statementClassifierFor(SyntaxKind.ImportDeclaration);
        const statement = firstStatementOfKind('import "./other.js";', SyntaxKind.ImportDeclaration);

        assert.strictEqual(classifier?.(statement, undefined), undefined);
    });

    test('statementClassifiers maps ExpressionStatement to a classifier that always reports it as a side effect', function () {
        const classifier = statementClassifierFor(SyntaxKind.ExpressionStatement);
        const statement = firstStatementOfKind('foo();', SyntaxKind.ExpressionStatement);

        assert.strictEqual(classifier?.(statement, undefined), 'expression statement');
    });

    test('statementClassifiers maps VariableStatement to a classifier that flags impure initializers', function () {
        const classifier = statementClassifierFor(SyntaxKind.VariableStatement);
        const statement = firstStatementOfKind('const x = Math.random();', SyntaxKind.VariableStatement);

        assert.strictEqual(classifier?.(statement, undefined), 'variable initializer');
    });

    test('statementClassifiers maps VariableStatement to a classifier that returns undefined for pure initializers', function () {
        const classifier = statementClassifierFor(SyntaxKind.VariableStatement);
        const statement = firstStatementOfKind('const x = 1;', SyntaxKind.VariableStatement);

        assert.strictEqual(classifier?.(statement, undefined), undefined);
    });

    test('statementClassifiers maps ClassDeclaration to a classifier that flags decorated classes', function () {
        const classifier = statementClassifierFor(SyntaxKind.ClassDeclaration);
        const statement = firstStatementOfKind(
            'function dec(_: unknown): void {}\n@dec\nclass Foo { method() { return 1; } }',
            SyntaxKind.ClassDeclaration
        );

        assert.strictEqual(classifier?.(statement, undefined), 'class declaration');
    });

    test('statementClassifiers maps ClassDeclaration to a classifier that returns undefined for plain classes', function () {
        const classifier = statementClassifierFor(SyntaxKind.ClassDeclaration);
        const statement = firstStatementOfKind('class Foo { method() { return 1; } }', SyntaxKind.ClassDeclaration);

        assert.strictEqual(classifier?.(statement, undefined), undefined);
    });

    test('statementClassifiers maps ExportAssignment to a classifier that flags impure default exports', function () {
        const classifier = statementClassifierFor(SyntaxKind.ExportAssignment);
        const statement = firstStatementOfKind('export default Math.random();', SyntaxKind.ExportAssignment);

        assert.strictEqual(classifier?.(statement, undefined), 'export assignment');
    });

    test('statementClassifiers maps ExportAssignment to a classifier that returns undefined for pure default exports', function () {
        const classifier = statementClassifierFor(SyntaxKind.ExportAssignment);
        const statement = firstStatementOfKind('export default 1;', SyntaxKind.ExportAssignment);

        assert.strictEqual(classifier?.(statement, undefined), undefined);
    });
});
