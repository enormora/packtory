import { SyntaxKind } from 'ts-morph';
import { toKebabCase } from 'remeda';

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
    SyntaxKind.FunctionExpression,
    SyntaxKind.ArrowFunction
);

export const shortCircuitOperators: ReadonlySet<SyntaxKind> = createSyntaxKindSet(
    SyntaxKind.AmpersandAmpersandToken,
    SyntaxKind.BarBarToken,
    SyntaxKind.QuestionQuestionToken
);

export const pureDeclarationKinds: ReadonlySet<SyntaxKind> = createSyntaxKindSet(
    SyntaxKind.FunctionDeclaration,
    SyntaxKind.InterfaceDeclaration,
    SyntaxKind.TypeAliasDeclaration,
    SyntaxKind.ExportDeclaration,
    SyntaxKind.EmptyStatement
);

const controlFlowStatementKinds = createSyntaxKindSet(
    SyntaxKind.IfStatement,
    SyntaxKind.ForStatement,
    SyntaxKind.ForInStatement,
    SyntaxKind.ForOfStatement,
    SyntaxKind.WhileStatement,
    SyntaxKind.DoStatement,
    SyntaxKind.SwitchStatement,
    SyntaxKind.TryStatement,
    SyntaxKind.ThrowStatement,
    SyntaxKind.LabeledStatement,
    SyntaxKind.Block
);

export function describeControlFlowStatementKind(kind: SyntaxKind): string | undefined {
    if (!controlFlowStatementKinds.has(kind)) {
        return undefined;
    }
    const name = kind === SyntaxKind.DoStatement
        ? 'do-while'
        : toKebabCase(SyntaxKind[kind].replace('Statement', ''));
    return `${name} statement`;
}
