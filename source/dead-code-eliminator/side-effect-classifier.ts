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
type PurityRule = (expression: Expression, recurse: PurityChecker) => boolean;
type StatementClassifier = (statement: Statement) => string | undefined;

const assetExtensions = ['.css', '.scss', '.sass', '.less'] as const;

const pureLeafKinds: ReadonlySet<SyntaxKind> = new Set([
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

const inherentlyPurePropertyKinds: ReadonlySet<SyntaxKind> = new Set([
    SyntaxKind.ShorthandPropertyAssignment,
    SyntaxKind.MethodDeclaration,
    SyntaxKind.GetAccessor,
    SyntaxKind.SetAccessor
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

function isPureArrayElement(element: Expression, recurse: PurityChecker): boolean {
    if (TsMorphNode.isOmittedExpression(element)) {
        return true;
    }
    if (TsMorphNode.isSpreadElement(element)) {
        return recurse(element.getExpression());
    }
    return recurse(element);
}

function isPurePropertyAssignment(property: TsMorphNode, recurse: PurityChecker): boolean {
    if (TsMorphNode.isPropertyAssignment(property)) {
        return recurse(property.getInitializerOrThrow());
    }
    if (TsMorphNode.isSpreadAssignment(property)) {
        return recurse(property.getExpression());
    }
    return inherentlyPurePropertyKinds.has(property.getKind());
}

const expressionPurityRules: ReadonlyMap<SyntaxKind, PurityRule> = new Map<SyntaxKind, PurityRule>([
    [
        SyntaxKind.TemplateExpression,
        (expression, recurse) => {
            return expression
                .asKindOrThrow(SyntaxKind.TemplateExpression)
                .getTemplateSpans()
                .every((span) => {
                    return recurse(span.getExpression());
                });
        }
    ],
    [
        SyntaxKind.ArrayLiteralExpression,
        (expression, recurse) => {
            return expression
                .asKindOrThrow(SyntaxKind.ArrayLiteralExpression)
                .getElements()
                .every((element) => {
                    return isPureArrayElement(element, recurse);
                });
        }
    ],
    [
        SyntaxKind.ObjectLiteralExpression,
        (expression, recurse) => {
            return expression
                .asKindOrThrow(SyntaxKind.ObjectLiteralExpression)
                .getProperties()
                .every((property) => {
                    return isPurePropertyAssignment(property, recurse);
                });
        }
    ],
    [
        SyntaxKind.AsExpression,
        (expression, recurse) => {
            return recurse(expression.asKindOrThrow(SyntaxKind.AsExpression).getExpression());
        }
    ],
    [
        SyntaxKind.SatisfiesExpression,
        (expression, recurse) => {
            return recurse(expression.asKindOrThrow(SyntaxKind.SatisfiesExpression).getExpression());
        }
    ],
    [
        SyntaxKind.ParenthesizedExpression,
        (expression, recurse) => {
            return recurse(expression.asKindOrThrow(SyntaxKind.ParenthesizedExpression).getExpression());
        }
    ],
    [
        SyntaxKind.TypeAssertionExpression,
        (expression, recurse) => {
            return recurse(expression.asKindOrThrow(SyntaxKind.TypeAssertionExpression).getExpression());
        }
    ],
    [
        SyntaxKind.NonNullExpression,
        (expression, recurse) => {
            return recurse(expression.asKindOrThrow(SyntaxKind.NonNullExpression).getExpression());
        }
    ],
    [
        SyntaxKind.PrefixUnaryExpression,
        (expression, recurse) => {
            const unary = expression.asKindOrThrow(SyntaxKind.PrefixUnaryExpression);
            return allowedPrefixUnaryOperators.has(unary.getOperatorToken()) && recurse(unary.getOperand());
        }
    ],
    [
        SyntaxKind.BinaryExpression,
        (expression, recurse) => {
            const binary = expression.asKindOrThrow(SyntaxKind.BinaryExpression);
            if (!allowedBinaryOperators.has(binary.getOperatorToken().getKind())) {
                return false;
            }
            return recurse(binary.getLeft()) && recurse(binary.getRight());
        }
    ]
]);

function isPureExpression(expression: Expression): boolean {
    const kind = expression.getKind();
    if (pureLeafKinds.has(kind)) {
        return true;
    }
    return expressionPurityRules.get(kind)?.(expression, isPureExpression) ?? false;
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

const statementClassifiers: ReadonlyMap<SyntaxKind, StatementClassifier> = new Map<SyntaxKind, StatementClassifier>([
    [
        SyntaxKind.ImportDeclaration,
        (statement) => {
            return classifyImportDeclaration(statement.asKindOrThrow(SyntaxKind.ImportDeclaration));
        }
    ],
    [
        SyntaxKind.ExportAssignment,
        (statement) => {
            return classifyExportAssignment(statement.asKindOrThrow(SyntaxKind.ExportAssignment));
        }
    ],
    [
        SyntaxKind.ClassDeclaration,
        (statement) => {
            return classifyClassDeclaration(statement.asKindOrThrow(SyntaxKind.ClassDeclaration));
        }
    ],
    [
        SyntaxKind.VariableStatement,
        (statement) => {
            return classifyVariableStatement(statement.asKindOrThrow(SyntaxKind.VariableStatement));
        }
    ],
    [
        SyntaxKind.ExpressionStatement,
        () => {
            return 'expression statement';
        }
    ]
]);

function classifyTopLevelStatement(statement: Statement): string | undefined {
    const kind = statement.getKind();
    if (pureDeclarationKinds.has(kind)) {
        return undefined;
    }
    const controlFlowKind = controlFlowStatementKinds.get(kind);
    if (controlFlowKind !== undefined) {
        return controlFlowKind;
    }
    const classifier = statementClassifiers.get(kind);
    if (classifier !== undefined) {
        return classifier(statement);
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
