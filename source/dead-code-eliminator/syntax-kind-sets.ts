import { SyntaxKind } from 'ts-morph';

function createSyntaxKindSet(...kinds: readonly SyntaxKind[]): ReadonlySet<SyntaxKind> {
    return new Set(kinds);
}

export const pureLeafKinds: ReadonlySet<SyntaxKind> = createSyntaxKindSet(
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
);

export const allowedPrefixUnaryOperators: ReadonlySet<SyntaxKind> = createSyntaxKindSet(
    SyntaxKind.MinusToken,
    SyntaxKind.PlusToken,
    SyntaxKind.ExclamationToken,
    SyntaxKind.TildeToken
);

export const allowedBinaryOperators: ReadonlySet<SyntaxKind> = createSyntaxKindSet(
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
);

export const inherentlyPurePropertyKinds: ReadonlySet<SyntaxKind> = createSyntaxKindSet(
    SyntaxKind.ShorthandPropertyAssignment,
    SyntaxKind.MethodDeclaration,
    SyntaxKind.GetAccessor,
    SyntaxKind.SetAccessor
);

export const pureDeclarationKinds: ReadonlySet<SyntaxKind> = createSyntaxKindSet(
    SyntaxKind.FunctionDeclaration,
    SyntaxKind.InterfaceDeclaration,
    SyntaxKind.TypeAliasDeclaration,
    SyntaxKind.EnumDeclaration,
    SyntaxKind.ModuleDeclaration,
    SyntaxKind.ExportDeclaration,
    SyntaxKind.EmptyStatement
);

export function describeControlFlowStatementKind(kind: SyntaxKind): string | undefined {
    const descriptions: Partial<Record<SyntaxKind, string>> = {
        [SyntaxKind.IfStatement]: 'if statement',
        [SyntaxKind.ForStatement]: 'for statement',
        [SyntaxKind.ForInStatement]: 'for-in statement',
        [SyntaxKind.ForOfStatement]: 'for-of statement',
        [SyntaxKind.WhileStatement]: 'while statement',
        [SyntaxKind.DoStatement]: 'do-while statement',
        [SyntaxKind.SwitchStatement]: 'switch statement',
        [SyntaxKind.TryStatement]: 'try statement',
        [SyntaxKind.ThrowStatement]: 'throw statement',
        [SyntaxKind.LabeledStatement]: 'labeled statement',
        [SyntaxKind.Block]: 'block statement'
    };

    return descriptions[kind];
}
