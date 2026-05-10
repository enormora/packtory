import {
    Node as TsMorphNode,
    SyntaxKind,
    type ClassDeclaration,
    type Expression,
    type ExportAssignment,
    type ImportDeclaration,
    type SourceFile,
    type Statement,
    type VariableStatement
} from 'ts-morph';
import type { SideEffectStatement } from './analyzed-bundle.ts';

type PurityChecker = (expression: Expression) => boolean;

const assetExtensions = ['.css', '.scss', '.sass', '.less'] as const;

const pureLiteralKinds: ReadonlySet<SyntaxKind> = new Set([
    SyntaxKind.StringLiteral,
    SyntaxKind.NumericLiteral,
    SyntaxKind.BigIntLiteral,
    SyntaxKind.TrueKeyword,
    SyntaxKind.FalseKeyword,
    SyntaxKind.NullKeyword,
    SyntaxKind.RegularExpressionLiteral,
    SyntaxKind.NoSubstitutionTemplateLiteral
]);

const allowedPrefixUnaryOperators: ReadonlySet<SyntaxKind> = new Set([
    SyntaxKind.MinusToken,
    SyntaxKind.PlusToken,
    SyntaxKind.ExclamationToken,
    SyntaxKind.TildeToken
]);

const allowedBinaryOperators: ReadonlySet<SyntaxKind> = new Set([
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

const pureDeclarationKinds: ReadonlySet<SyntaxKind> = new Set([
    SyntaxKind.FunctionDeclaration,
    SyntaxKind.InterfaceDeclaration,
    SyntaxKind.TypeAliasDeclaration,
    SyntaxKind.EnumDeclaration,
    SyntaxKind.ModuleDeclaration,
    SyntaxKind.ExportDeclaration,
    SyntaxKind.EmptyStatement
]);

const controlFlowStatementKinds: ReadonlyMap<SyntaxKind, string> = new Map([
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

function endsWithAssetExtension(specifier: string): boolean {
    return assetExtensions.some((extension) => {
        return specifier.endsWith(extension);
    });
}

function isPureLeafExpression(expression: Expression): boolean {
    return (
        pureLiteralKinds.has(expression.getKind()) ||
        TsMorphNode.isIdentifier(expression) ||
        TsMorphNode.isFunctionExpression(expression) ||
        TsMorphNode.isArrowFunction(expression) ||
        TsMorphNode.isClassExpression(expression)
    );
}

function isPureArrayElement(element: Expression, recurse: PurityChecker): boolean {
    if (TsMorphNode.isOmittedExpression(element)) {
        return true;
    }
    if (TsMorphNode.isSpreadElement(element)) {
        return recurse(element.getExpression());
    }
    return recurse(element);
}

const inherentlyPurePropertyKinds: ReadonlySet<SyntaxKind> = new Set([
    SyntaxKind.ShorthandPropertyAssignment,
    SyntaxKind.MethodDeclaration,
    SyntaxKind.GetAccessor,
    SyntaxKind.SetAccessor
]);

function isPurePropertyAssignment(property: TsMorphNode, recurse: PurityChecker): boolean {
    if (TsMorphNode.isPropertyAssignment(property)) {
        const initializer = property.getInitializer();
        return initializer !== undefined && recurse(initializer);
    }
    if (TsMorphNode.isSpreadAssignment(property)) {
        return recurse(property.getExpression());
    }
    return inherentlyPurePropertyKinds.has(property.getKind());
}

function isPureContainerExpression(expression: Expression, recurse: PurityChecker): boolean {
    if (TsMorphNode.isTemplateExpression(expression)) {
        return expression.getTemplateSpans().every((span) => {
            return recurse(span.getExpression());
        });
    }
    if (TsMorphNode.isArrayLiteralExpression(expression)) {
        return expression.getElements().every((element) => {
            return isPureArrayElement(element, recurse);
        });
    }
    if (TsMorphNode.isObjectLiteralExpression(expression)) {
        return expression.getProperties().every((property) => {
            return isPurePropertyAssignment(property, recurse);
        });
    }
    return false;
}

function isPureCastExpression(expression: Expression, recurse: PurityChecker): boolean {
    if (
        TsMorphNode.isAsExpression(expression) ||
        TsMorphNode.isSatisfiesExpression(expression) ||
        TsMorphNode.isParenthesizedExpression(expression) ||
        TsMorphNode.isTypeAssertion(expression) ||
        TsMorphNode.isNonNullExpression(expression)
    ) {
        return recurse(expression.getExpression());
    }
    return false;
}

function isPureUnaryExpression(expression: Expression, recurse: PurityChecker): boolean {
    if (!TsMorphNode.isPrefixUnaryExpression(expression)) {
        return false;
    }
    return allowedPrefixUnaryOperators.has(expression.getOperatorToken()) && recurse(expression.getOperand());
}

function isPureBinaryExpression(expression: Expression, recurse: PurityChecker): boolean {
    if (!TsMorphNode.isBinaryExpression(expression)) {
        return false;
    }
    if (!allowedBinaryOperators.has(expression.getOperatorToken().getKind())) {
        return false;
    }
    return recurse(expression.getLeft()) && recurse(expression.getRight());
}

function isPureExpression(expression: Expression): boolean {
    return (
        isPureLeafExpression(expression) ||
        isPureContainerExpression(expression, isPureExpression) ||
        isPureCastExpression(expression, isPureExpression) ||
        isPureUnaryExpression(expression, isPureExpression) ||
        isPureBinaryExpression(expression, isPureExpression)
    );
}

function memberHasDecorators(member: TsMorphNode): boolean {
    if (
        TsMorphNode.isMethodDeclaration(member) ||
        TsMorphNode.isPropertyDeclaration(member) ||
        TsMorphNode.isGetAccessorDeclaration(member) ||
        TsMorphNode.isSetAccessorDeclaration(member)
    ) {
        return member.getDecorators().length > 0;
    }
    return false;
}

function memberHasImpureStaticInit(member: TsMorphNode): boolean {
    if (!TsMorphNode.isPropertyDeclaration(member) || !member.isStatic()) {
        return false;
    }
    const initializer = member.getInitializer();
    return initializer !== undefined && !isPureExpression(initializer);
}

function classMemberIsImpure(member: TsMorphNode): boolean {
    if (TsMorphNode.isClassStaticBlockDeclaration(member)) {
        return true;
    }
    return memberHasDecorators(member) || memberHasImpureStaticInit(member);
}

function hasClassImpurity(classDeclaration: ClassDeclaration): boolean {
    if (classDeclaration.getDecorators().length > 0) {
        return true;
    }
    return classDeclaration.getMembers().some(classMemberIsImpure);
}

function classifyImportDeclaration(statement: ImportDeclaration): string | undefined {
    if (endsWithAssetExtension(statement.getModuleSpecifierValue())) {
        return 'asset import';
    }
    return undefined;
}

function classifyExportAssignment(statement: ExportAssignment): string | undefined {
    if (isPureExpression(statement.getExpression())) {
        return undefined;
    }
    return 'export assignment';
}

function classifyClassDeclaration(statement: ClassDeclaration): string | undefined {
    if (hasClassImpurity(statement)) {
        return 'class declaration';
    }
    return undefined;
}

function classifyVariableStatement(statement: VariableStatement): string | undefined {
    const hasImpureInitializer = statement.getDeclarations().some((declarator) => {
        const initializer = declarator.getInitializer();
        return initializer !== undefined && !isPureExpression(initializer);
    });
    if (hasImpureInitializer) {
        return 'variable initializer';
    }
    return undefined;
}

type ClassificationMatch = {
    readonly kind: string | undefined;
};

function classifyByKindLookup(kind: SyntaxKind): ClassificationMatch | undefined {
    if (pureDeclarationKinds.has(kind)) {
        return { kind: undefined };
    }
    const controlFlowKind = controlFlowStatementKinds.get(kind);
    if (controlFlowKind !== undefined) {
        return { kind: controlFlowKind };
    }
    return undefined;
}

function classifyDeclarativeStatement(statement: Statement): ClassificationMatch | undefined {
    if (TsMorphNode.isImportDeclaration(statement)) {
        return { kind: classifyImportDeclaration(statement) };
    }
    if (TsMorphNode.isExportAssignment(statement)) {
        return { kind: classifyExportAssignment(statement) };
    }
    if (TsMorphNode.isClassDeclaration(statement)) {
        return { kind: classifyClassDeclaration(statement) };
    }
    if (TsMorphNode.isVariableStatement(statement)) {
        return { kind: classifyVariableStatement(statement) };
    }
    return undefined;
}

function classifyTopLevelStatement(statement: Statement): string | undefined {
    const lookup = classifyByKindLookup(statement.getKind());
    if (lookup !== undefined) {
        return lookup.kind;
    }
    const declarativeMatch = classifyDeclarativeStatement(statement);
    if (declarativeMatch !== undefined) {
        return declarativeMatch.kind;
    }
    if (TsMorphNode.isExpressionStatement(statement)) {
        return 'expression statement';
    }
    return 'unknown statement';
}

export function classifySideEffects(sourceFile: Readonly<SourceFile>): readonly SideEffectStatement[] {
    return sourceFile.getStatements().flatMap((statement) => {
        const kind = classifyTopLevelStatement(statement);
        if (kind === undefined) {
            return [];
        }
        return [{ line: statement.getStartLineNumber(), kind }];
    });
}
