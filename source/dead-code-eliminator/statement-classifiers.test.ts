import assert from 'node:assert';
import { suite, test } from 'mocha';
import { SyntaxKind, type SourceFile, type Statement, type Expression } from 'ts-morph';
import { createProject } from '../test-libraries/typescript-project.ts';
import { resolveRuntimeModule } from './runtime-module-resolution.ts';
import { createExpressionPurityChecker } from './pure-expression.ts';
import { statementClassifierFor } from './statement-classifiers.ts';
import { resolveComputedPropertyKey } from './computed-property-key-purity.ts';

function firstStatementOfKind(content: string, kind: SyntaxKind): Statement {
    const project = createProject({ withFiles: [ { filePath: 'index.ts', content } ] });
    const sourceFile: SourceFile = project.getSourceFileOrThrow('index.ts');

    return sourceFile.getFirstChildByKindOrThrow(kind) as Statement;
}

const isPure = createExpressionPurityChecker(undefined, resolveRuntimeModule);
const propertyKeyFor = function (expression: Expression): string | undefined {
    return resolveComputedPropertyKey(expression, resolveRuntimeModule);
};

suite('statement-classifiers', function () {
    test('statementClassifiers maps ImportDeclaration to a classifier that flags .css imports', function () {
        const classifier = statementClassifierFor(SyntaxKind.ImportDeclaration);
        const statement = firstStatementOfKind('import "./style.css";', SyntaxKind.ImportDeclaration);

        assert.strictEqual(classifier?.(statement, isPure, propertyKeyFor), 'css import');
    });

    test('statementClassifiers maps ImportDeclaration to a classifier that returns undefined for non-css imports', function () {
        const classifier = statementClassifierFor(SyntaxKind.ImportDeclaration);
        const statement = firstStatementOfKind('import "./other.js";', SyntaxKind.ImportDeclaration);

        assert.strictEqual(classifier?.(statement, isPure, propertyKeyFor), undefined);
    });

    test('statementClassifiers maps ExpressionStatement to a classifier that always reports it as a side effect', function () {
        const classifier = statementClassifierFor(SyntaxKind.ExpressionStatement);
        const statement = firstStatementOfKind('foo();', SyntaxKind.ExpressionStatement);

        assert.strictEqual(classifier?.(statement, isPure, propertyKeyFor), 'expression statement');
    });

    suite('variable declarations', function () {
        for (
            const [ content, expected ] of [
                [ 'using resource={};', 'resource declaration' ],
                [ 'using resource=1;', 'resource declaration' ],
                [ 'using resource=null;', undefined ],
                [ 'using resource=undefined;', undefined ],
                [ 'using first=null,second=1;', 'resource declaration' ],
                [ 'await using resource=null;export {};', 'resource declaration' ]
            ] as const
        ) {
            test(`classifies resource effects in ${content}`, function () {
                const classifier = statementClassifierFor(SyntaxKind.VariableStatement);
                const statement = firstStatementOfKind(content, SyntaxKind.VariableStatement);
                assert.strictEqual(classifier?.(statement, isPure, propertyKeyFor), expected);
            });
        }

        test('statementClassifiers maps VariableStatement to a classifier that flags impure initializers', function () {
            const classifier = statementClassifierFor(SyntaxKind.VariableStatement);
            const statement = firstStatementOfKind('const x = Math.random();', SyntaxKind.VariableStatement);

            assert.strictEqual(classifier?.(statement, isPure, propertyKeyFor), 'variable initializer');
        });

        test('statementClassifiers maps VariableStatement to a classifier that returns undefined for pure initializers', function () {
            const classifier = statementClassifierFor(SyntaxKind.VariableStatement);
            const statement = firstStatementOfKind('const x = 1;', SyntaxKind.VariableStatement);

            assert.strictEqual(classifier?.(statement, isPure, propertyKeyFor), undefined);
        });

        for (
            const content of [
                'const { x } = { get x() { return 1; } };',
                'const [x] = [1];',
                'const {} = null;',
                'const [] = null;'
            ]
        ) {
            test(`statementClassifiers flags binding evaluation in ${content}`, function () {
                const classifier = statementClassifierFor(SyntaxKind.VariableStatement);
                const statement = firstStatementOfKind(content, SyntaxKind.VariableStatement);

                assert.strictEqual(classifier?.(statement, isPure, propertyKeyFor), 'variable binding pattern');
            });
        }
    });

    test('statementClassifiers maps ClassDeclaration to a classifier that flags decorated classes', function () {
        const classifier = statementClassifierFor(SyntaxKind.ClassDeclaration);
        const statement = firstStatementOfKind(
            'function dec(_: unknown): void {}\n@dec\nclass Foo { method() { return 1; } }',
            SyntaxKind.ClassDeclaration
        );

        assert.strictEqual(classifier?.(statement, isPure, propertyKeyFor), 'class declaration');
    });

    test('statementClassifiers maps ClassDeclaration to a classifier that returns undefined for plain classes', function () {
        const classifier = statementClassifierFor(SyntaxKind.ClassDeclaration);
        const statement = firstStatementOfKind('class Foo { method() { return 1; } }', SyntaxKind.ClassDeclaration);

        assert.strictEqual(classifier?.(statement, isPure, propertyKeyFor), undefined);
    });

    test('statementClassifiers maps ExportAssignment to a classifier that flags impure default exports', function () {
        const classifier = statementClassifierFor(SyntaxKind.ExportAssignment);
        const statement = firstStatementOfKind('export default Math.random();', SyntaxKind.ExportAssignment);

        assert.strictEqual(classifier?.(statement, isPure, propertyKeyFor), 'export assignment');
    });

    test('statementClassifiers maps ExportAssignment to a classifier that returns undefined for pure default exports', function () {
        const classifier = statementClassifierFor(SyntaxKind.ExportAssignment);
        const statement = firstStatementOfKind('export default 1;', SyntaxKind.ExportAssignment);

        assert.strictEqual(classifier?.(statement, isPure, propertyKeyFor), undefined);
    });
});
