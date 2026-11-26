import assert from 'node:assert';
import { suite, test } from 'mocha';
import { SyntaxKind } from 'ts-morph';
import {
    describeControlFlowStatementKind,
    pureDeclarationKinds,
    pureLeafKinds
} from './syntax-kind-sets.ts';

suite('syntax-kind-sets', function () {
    test('pureLeafKinds classifies primitive literals and function expressions as pure leaves', function () {
        for (
            const kind of [
                SyntaxKind.StringLiteral,
                SyntaxKind.NumericLiteral,
                SyntaxKind.TrueKeyword,
                SyntaxKind.NullKeyword,
                SyntaxKind.ArrowFunction
            ]
        ) {
            assert.strictEqual(pureLeafKinds.has(kind), true);
        }
    });

    test('pureLeafKinds does not classify object, array, or class expressions as pure leaves', function () {
        assert.strictEqual(pureLeafKinds.has(SyntaxKind.ObjectLiteralExpression), false);
        assert.strictEqual(pureLeafKinds.has(SyntaxKind.ArrayLiteralExpression), false);
        assert.strictEqual(pureLeafKinds.has(SyntaxKind.ClassExpression), false);
    });

    test('pureDeclarationKinds includes declarations that are always pure', function () {
        for (
            const kind of [
                SyntaxKind.FunctionDeclaration,
                SyntaxKind.InterfaceDeclaration,
                SyntaxKind.TypeAliasDeclaration,
                SyntaxKind.ExportDeclaration,
                SyntaxKind.EmptyStatement
            ]
        ) {
            assert.strictEqual(pureDeclarationKinds.has(kind), true);
        }
        assert.strictEqual(pureDeclarationKinds.has(SyntaxKind.EnumDeclaration), false);
        assert.strictEqual(pureDeclarationKinds.has(SyntaxKind.ModuleDeclaration), false);
    });

    test('describeControlFlowStatementKind maps control-flow statements to labels', function () {
        const expectedLabels = new Map([
            [ SyntaxKind.IfStatement, 'if statement' ],
            [ SyntaxKind.ForStatement, 'for statement' ],
            [ SyntaxKind.ForInStatement, 'for-in statement' ],
            [ SyntaxKind.ForOfStatement, 'for-of statement' ],
            [ SyntaxKind.WhileStatement, 'while statement' ],
            [ SyntaxKind.DoStatement, 'do-while statement' ],
            [ SyntaxKind.SwitchStatement, 'switch statement' ],
            [ SyntaxKind.TryStatement, 'try statement' ],
            [ SyntaxKind.ThrowStatement, 'throw statement' ],
            [ SyntaxKind.LabeledStatement, 'labeled statement' ],
            [ SyntaxKind.Block, 'block statement' ]
        ]);

        for (const [ kind, label ] of expectedLabels) {
            assert.strictEqual(describeControlFlowStatementKind(kind), label);
        }
        assert.strictEqual(describeControlFlowStatementKind(SyntaxKind.ExpressionStatement), undefined);
    });
});
