import { SyntaxKind } from 'ts-morph';

export const pureLeafKinds: ReadonlySet<SyntaxKind> = new Set([
    SyntaxKind.StringLiteral,
    SyntaxKind.NumericLiteral,
    SyntaxKind.BigIntLiteral,
    SyntaxKind.TrueKeyword,
    SyntaxKind.FalseKeyword,
    SyntaxKind.NullKeyword,
    SyntaxKind.RegularExpressionLiteral,
    SyntaxKind.NoSubstitutionTemplateLiteral,
    SyntaxKind.Identifier,
    SyntaxKind.FunctionExpression,
    SyntaxKind.ArrowFunction,
    SyntaxKind.ClassExpression
]);

export const allowedPrefixUnaryOperators: ReadonlySet<SyntaxKind> = new Set([
    SyntaxKind.MinusToken,
    SyntaxKind.PlusToken,
    SyntaxKind.ExclamationToken,
    SyntaxKind.TildeToken
]);

export const allowedBinaryOperators: ReadonlySet<SyntaxKind> = new Set([
    SyntaxKind.PlusToken,
    SyntaxKind.MinusToken,
    SyntaxKind.AsteriskToken,
    SyntaxKind.SlashToken,
    SyntaxKind.PercentToken,
    SyntaxKind.AsteriskAsteriskToken,
    SyntaxKind.AmpersandAmpersandToken,
    SyntaxKind.BarBarToken,
    SyntaxKind.QuestionQuestionToken,
    SyntaxKind.LessThanToken,
    SyntaxKind.GreaterThanToken,
    SyntaxKind.LessThanEqualsToken,
    SyntaxKind.GreaterThanEqualsToken,
    SyntaxKind.EqualsEqualsEqualsToken,
    SyntaxKind.ExclamationEqualsEqualsToken
]);

export const inherentlyPurePropertyKinds: ReadonlySet<SyntaxKind> = new Set([
    SyntaxKind.ShorthandPropertyAssignment,
    SyntaxKind.MethodDeclaration,
    SyntaxKind.GetAccessor,
    SyntaxKind.SetAccessor
]);

export const pureDeclarationKinds: ReadonlySet<SyntaxKind> = new Set([
    SyntaxKind.FunctionDeclaration,
    SyntaxKind.InterfaceDeclaration,
    SyntaxKind.TypeAliasDeclaration,
    SyntaxKind.EnumDeclaration,
    SyntaxKind.ModuleDeclaration,
    SyntaxKind.ExportDeclaration,
    SyntaxKind.EmptyStatement
]);

export const controlFlowStatementKinds: ReadonlyMap<SyntaxKind, string> = new Map([
    [SyntaxKind.IfStatement, 'if statement'],
    [SyntaxKind.ForStatement, 'for statement'],
    [SyntaxKind.ForInStatement, 'for-in statement'],
    [SyntaxKind.ForOfStatement, 'for-of statement'],
    [SyntaxKind.WhileStatement, 'while statement'],
    [SyntaxKind.DoStatement, 'do-while statement'],
    [SyntaxKind.SwitchStatement, 'switch statement'],
    [SyntaxKind.TryStatement, 'try statement'],
    [SyntaxKind.ThrowStatement, 'throw statement'],
    [SyntaxKind.LabeledStatement, 'labeled statement'],
    [SyntaxKind.Block, 'block statement']
]);
