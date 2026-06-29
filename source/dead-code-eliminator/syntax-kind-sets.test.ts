import assert from 'node:assert';
import { suite, test } from 'mocha';
import { SyntaxKind } from 'ts-morph';
import {
    allowedBinaryOperators,
    allowedPrefixUnaryOperators,
    describeControlFlowStatementKind,
    inherentlyPurePropertyKinds,
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
                SyntaxKind.Identifier,
                SyntaxKind.ArrowFunction
            ]
        ) {
            assert.strictEqual(pureLeafKinds.has(kind), true);
        }
    });

    test('pureLeafKinds does not classify object or array literals as pure leaves', function () {
        assert.strictEqual(pureLeafKinds.has(SyntaxKind.ObjectLiteralExpression), false);
        assert.strictEqual(pureLeafKinds.has(SyntaxKind.ArrayLiteralExpression), false);
    });

    test('allowedPrefixUnaryOperators only permits arithmetic and boolean prefixes', function () {
        for (
            const kind of [
                SyntaxKind.MinusToken,
                SyntaxKind.PlusToken,
                SyntaxKind.ExclamationToken,
                SyntaxKind.TildeToken
            ]
        ) {
            assert.strictEqual(allowedPrefixUnaryOperators.has(kind), true);
        }
    });

    test('allowedBinaryOperators permits arithmetic and strict equality but not assignment', function () {
        assert.strictEqual(allowedBinaryOperators.has(SyntaxKind.PlusToken), true);
        assert.strictEqual(allowedBinaryOperators.has(SyntaxKind.EqualsEqualsEqualsToken), true);
        assert.strictEqual(allowedBinaryOperators.has(SyntaxKind.EqualsToken), false);
    });

    test('inherentlyPurePropertyKinds includes accessors, methods, and shorthand properties', function () {
        for (
            const kind of [
                SyntaxKind.ShorthandPropertyAssignment,
                SyntaxKind.MethodDeclaration,
                SyntaxKind.GetAccessor,
                SyntaxKind.SetAccessor
            ]
        ) {
            assert.strictEqual(inherentlyPurePropertyKinds.has(kind), true);
        }
    });

    test('pureDeclarationKinds includes function, interface, type alias, enum, namespace, and export declarations', function () {
        for (
            const kind of [
                SyntaxKind.FunctionDeclaration,
                SyntaxKind.InterfaceDeclaration,
                SyntaxKind.TypeAliasDeclaration,
                SyntaxKind.EnumDeclaration,
                SyntaxKind.ModuleDeclaration,
                SyntaxKind.ExportDeclaration,
                SyntaxKind.EmptyStatement
            ]
        ) {
            assert.strictEqual(pureDeclarationKinds.has(kind), true);
        }
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
