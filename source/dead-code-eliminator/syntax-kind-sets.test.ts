import assert from 'node:assert';
import { test } from 'mocha';
import { SyntaxKind } from 'ts-morph';
import {
    allowedBinaryOperators,
    allowedPrefixUnaryOperators,
    controlFlowStatementKinds,
    inherentlyPurePropertyKinds,
    pureDeclarationKinds,
    pureLeafKinds
} from './syntax-kind-sets.ts';

test('pureLeafKinds classifies primitive literals and function expressions as pure leaves', () => {
    for (const kind of [
        SyntaxKind.StringLiteral,
        SyntaxKind.NumericLiteral,
        SyntaxKind.TrueKeyword,
        SyntaxKind.NullKeyword,
        SyntaxKind.Identifier,
        SyntaxKind.ArrowFunction
    ]) {
        assert.strictEqual(pureLeafKinds.has(kind), true);
    }
});

test('pureLeafKinds does not classify object or array literals as pure leaves', () => {
    assert.strictEqual(pureLeafKinds.has(SyntaxKind.ObjectLiteralExpression), false);
    assert.strictEqual(pureLeafKinds.has(SyntaxKind.ArrayLiteralExpression), false);
});

test('allowedPrefixUnaryOperators only permits arithmetic and boolean prefixes', () => {
    for (const kind of [
        SyntaxKind.MinusToken,
        SyntaxKind.PlusToken,
        SyntaxKind.ExclamationToken,
        SyntaxKind.TildeToken
    ]) {
        assert.strictEqual(allowedPrefixUnaryOperators.has(kind), true);
    }
});

test('allowedBinaryOperators permits arithmetic and strict equality but not assignment', () => {
    assert.strictEqual(allowedBinaryOperators.has(SyntaxKind.PlusToken), true);
    assert.strictEqual(allowedBinaryOperators.has(SyntaxKind.EqualsEqualsEqualsToken), true);
    assert.strictEqual(allowedBinaryOperators.has(SyntaxKind.EqualsToken), false);
});

test('inherentlyPurePropertyKinds includes accessors, methods, and shorthand properties', () => {
    for (const kind of [
        SyntaxKind.ShorthandPropertyAssignment,
        SyntaxKind.MethodDeclaration,
        SyntaxKind.GetAccessor,
        SyntaxKind.SetAccessor
    ]) {
        assert.strictEqual(inherentlyPurePropertyKinds.has(kind), true);
    }
});

test('pureDeclarationKinds includes function, interface, type alias, enum, namespace, and export declarations', () => {
    for (const kind of [
        SyntaxKind.FunctionDeclaration,
        SyntaxKind.InterfaceDeclaration,
        SyntaxKind.TypeAliasDeclaration,
        SyntaxKind.EnumDeclaration,
        SyntaxKind.ModuleDeclaration,
        SyntaxKind.ExportDeclaration,
        SyntaxKind.EmptyStatement
    ]) {
        assert.strictEqual(pureDeclarationKinds.has(kind), true);
    }
});

test('controlFlowStatementKinds maps if, for, while, switch, and try statements to a label', () => {
    assert.strictEqual(controlFlowStatementKinds.get(SyntaxKind.IfStatement), 'if statement');
    assert.strictEqual(controlFlowStatementKinds.get(SyntaxKind.ForStatement), 'for statement');
    assert.strictEqual(controlFlowStatementKinds.get(SyntaxKind.WhileStatement), 'while statement');
    assert.strictEqual(controlFlowStatementKinds.get(SyntaxKind.SwitchStatement), 'switch statement');
    assert.strictEqual(controlFlowStatementKinds.get(SyntaxKind.TryStatement), 'try statement');
});
