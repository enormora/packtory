import {
    Node as TsMorphNode,
    SyntaxKind,
    type CallExpression,
    type ClassDeclaration,
    type Expression,
    type ExportAssignment,
    type Identifier,
    type ImportDeclaration,
    type ImportClause,
    type ImportSpecifier,
    type NamespaceImport,
    type NewExpression,
    type SourceFile,
    type Statement,
    type VariableStatement
} from 'ts-morph';
import type { DeadCodeEliminationSettings } from '../config/dead-code-elimination-settings.ts';
import type { SideEffectStatement } from './analyzed-bundle.ts';

type PurityChecker = (expression: Expression) => boolean;
type PurityRule = (
    expression: Expression,
    recurse: PurityChecker,
    settings: DeadCodeEliminationSettings | undefined
) => boolean;
type StatementClassifier = (
    statement: Statement,
    settings: DeadCodeEliminationSettings | undefined
) => string | undefined;
type ImportedExpressionOrigin = {
    readonly from: string;
    readonly path: readonly string[];
};

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

function isBareCssImport(specifier: string): boolean {
    return specifier.endsWith('.css');
}

function nextUnwrappedExpression(expression: Expression): Expression | undefined {
    if (TsMorphNode.isAsExpression(expression) || TsMorphNode.isSatisfiesExpression(expression)) {
        return expression.getExpression();
    }
    if (
        TsMorphNode.isParenthesizedExpression(expression) ||
        TsMorphNode.isTypeAssertion(expression) ||
        TsMorphNode.isNonNullExpression(expression)
    ) {
        return expression.getExpression();
    }
    return undefined;
}

function unwrapExpression(expression: Expression): Expression {
    const nextExpression = nextUnwrappedExpression(expression);
    return nextExpression === undefined ? expression : unwrapExpression(nextExpression);
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

function importedOriginForImportSpecifier(
    importSpecifier: ImportSpecifier | undefined
): ImportedExpressionOrigin | undefined {
    if (importSpecifier === undefined) {
        return undefined;
    }
    return {
        from: importSpecifier.getImportDeclaration().getModuleSpecifierValue(),
        path: [importSpecifier.getName()]
    };
}

function importedOriginForNamespaceImport(
    namespaceImport: NamespaceImport | undefined
): ImportedExpressionOrigin | undefined {
    if (namespaceImport === undefined) {
        return undefined;
    }
    return {
        from: namespaceImport.getFirstAncestorByKindOrThrow(SyntaxKind.ImportDeclaration).getModuleSpecifierValue(),
        path: []
    };
}

function importedOriginForDefaultImport(importClause: ImportClause | undefined): ImportedExpressionOrigin | undefined {
    if (importClause === undefined) {
        return undefined;
    }
    return {
        from: importClause.getFirstAncestorByKindOrThrow(SyntaxKind.ImportDeclaration).getModuleSpecifierValue(),
        path: ['default']
    };
}

function importedOriginForIdentifier(identifier: Identifier): ImportedExpressionOrigin | undefined {
    const symbol = identifier.getSymbol();
    if (symbol === undefined) {
        return undefined;
    }

    const declarations = symbol.getDeclarations();
    return (
        importedOriginForImportSpecifier(declarations.find(TsMorphNode.isImportSpecifier)) ??
        importedOriginForNamespaceImport(declarations.find(TsMorphNode.isNamespaceImport)) ??
        importedOriginForDefaultImport(declarations.find(TsMorphNode.isImportClause))
    );
}

function expressionOriginIsTrusted(
    origin: ImportedExpressionOrigin | undefined,
    settings: DeadCodeEliminationSettings | undefined
): boolean {
    const pureImports = settings?.pureImports;
    if (origin === undefined || pureImports === undefined) {
        return false;
    }

    return pureImports.some((trustedImport) => {
        if (trustedImport.from !== origin.from) {
            return false;
        }

        if (trustedImport.imports === undefined) {
            return true;
        }

        const trustedImports = trustedImport.imports;
        const matchingPathHead = origin.path.slice(0, 1).filter((pathPart) => {
            return trustedImports.includes(pathPart);
        });
        return matchingPathHead.length === 1;
    });
}

function arePureCallArguments(callArguments: readonly TsMorphNode[], recurse: PurityChecker): boolean {
    return callArguments.every((argument) => {
        if (TsMorphNode.isSpreadElement(argument)) {
            return recurse(argument.getExpression());
        }
        return TsMorphNode.isExpression(argument) && recurse(argument);
    });
}

type ImportedOriginResolver = (
    expression: Expression,
    recurse: PurityChecker,
    settings: DeadCodeEliminationSettings | undefined
) => ImportedExpressionOrigin | undefined;
type ImportedOriginContext = {
    readonly recurse: PurityChecker;
    readonly settings: DeadCodeEliminationSettings | undefined;
    readonly resolveOrigin: ImportedOriginResolver;
};

function resolveImportedPropertyAccessOrigin(
    expression: Expression,
    propertyName: string,
    context: ImportedOriginContext
): ImportedExpressionOrigin | undefined {
    const base = context.resolveOrigin(expression, context.recurse, context.settings);
    return base === undefined ? undefined : { from: base.from, path: [...base.path, propertyName] };
}

function resolveImportedCallOrigin(
    expression: CallExpression,
    context: ImportedOriginContext
): ImportedExpressionOrigin | undefined {
    const calleeOrigin = context.resolveOrigin(expression.getExpression(), context.recurse, context.settings);
    if (!expressionOriginIsTrusted(calleeOrigin, context.settings)) {
        return undefined;
    }
    return arePureCallArguments(expression.getArguments(), context.recurse) ? calleeOrigin : undefined;
}

function resolveImportedExpressionOrigin(
    expression: Expression,
    recurse: PurityChecker,
    settings: DeadCodeEliminationSettings | undefined
): ImportedExpressionOrigin | undefined {
    const unwrapped = unwrapExpression(expression);
    if (TsMorphNode.isIdentifier(unwrapped)) {
        return importedOriginForIdentifier(unwrapped);
    }
    const context = { recurse, settings, resolveOrigin: resolveImportedExpressionOrigin };
    if (TsMorphNode.isPropertyAccessExpression(unwrapped)) {
        return resolveImportedPropertyAccessOrigin(unwrapped.getExpression(), unwrapped.getName(), context);
    }
    return TsMorphNode.isCallExpression(unwrapped) ? resolveImportedCallOrigin(unwrapped, context) : undefined;
}

function isPureCallExpression(
    expression: CallExpression,
    recurse: PurityChecker,
    settings: DeadCodeEliminationSettings | undefined
): boolean {
    return resolveImportedExpressionOrigin(expression, recurse, settings) !== undefined;
}

function isPureNewExpression(
    expression: NewExpression,
    recurse: PurityChecker,
    settings: DeadCodeEliminationSettings | undefined
): boolean {
    const constructorExpression = unwrapExpression(expression.getExpression());
    const pureConstructors = settings?.pureConstructors;
    return (
        TsMorphNode.isIdentifier(constructorExpression) &&
        pureConstructors !== undefined &&
        pureConstructors.includes(constructorExpression.getText()) &&
        arePureCallArguments(expression.getArguments(), recurse)
    );
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
    ],
    [
        SyntaxKind.CallExpression,
        (expression, recurse, settings) => {
            return isPureCallExpression(expression.asKindOrThrow(SyntaxKind.CallExpression), recurse, settings);
        }
    ],
    [
        SyntaxKind.NewExpression,
        (expression, recurse, settings) => {
            return isPureNewExpression(expression.asKindOrThrow(SyntaxKind.NewExpression), recurse, settings);
        }
    ]
]);

function isPureExpression(expression: Expression, settings: DeadCodeEliminationSettings | undefined): boolean {
    const unwrapped = unwrapExpression(expression);
    const recurse = (candidate: Expression): boolean => {
        return isPureExpression(candidate, settings);
    };
    const kind = unwrapped.getKind();
    if (pureLeafKinds.has(kind)) {
        return true;
    }
    return expressionPurityRules.get(kind)?.(unwrapped, recurse, settings) ?? false;
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

function memberHasImpureStaticInit(member: TsMorphNode, settings: DeadCodeEliminationSettings | undefined): boolean {
    if (!TsMorphNode.isPropertyDeclaration(member) || !member.isStatic()) {
        return false;
    }
    const initializer = member.getInitializer();
    return initializer !== undefined && !isPureExpression(initializer, settings);
}

function classMemberIsImpure(member: TsMorphNode, settings: DeadCodeEliminationSettings | undefined): boolean {
    if (TsMorphNode.isClassStaticBlockDeclaration(member)) {
        return true;
    }
    return memberHasDecorators(member) || memberHasImpureStaticInit(member, settings);
}

function hasClassImpurity(
    classDeclaration: ClassDeclaration,
    settings: DeadCodeEliminationSettings | undefined
): boolean {
    if (classDeclaration.getDecorators().length > 0) {
        return true;
    }
    return classDeclaration.getMembers().some((member) => {
        return classMemberIsImpure(member, settings);
    });
}

function classifyImportDeclaration(statement: ImportDeclaration): string | undefined {
    if (isBareCssImport(statement.getModuleSpecifierValue())) {
        return 'css import';
    }
    return undefined;
}

function classifyExportAssignment(
    statement: ExportAssignment,
    settings: DeadCodeEliminationSettings | undefined
): string | undefined {
    if (isPureExpression(statement.getExpression(), settings)) {
        return undefined;
    }
    return 'export assignment';
}

function classifyClassDeclaration(
    statement: ClassDeclaration,
    settings: DeadCodeEliminationSettings | undefined
): string | undefined {
    if (hasClassImpurity(statement, settings)) {
        return 'class declaration';
    }
    return undefined;
}

function classifyVariableStatement(
    statement: VariableStatement,
    settings: DeadCodeEliminationSettings | undefined
): string | undefined {
    const hasImpureInitializer = statement.getDeclarations().some((declarator) => {
        const initializer = declarator.getInitializer();
        return initializer !== undefined && !isPureExpression(initializer, settings);
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
        (statement, settings) => {
            return classifyExportAssignment(statement.asKindOrThrow(SyntaxKind.ExportAssignment), settings);
        }
    ],
    [
        SyntaxKind.ClassDeclaration,
        (statement, settings) => {
            return classifyClassDeclaration(statement.asKindOrThrow(SyntaxKind.ClassDeclaration), settings);
        }
    ],
    [
        SyntaxKind.VariableStatement,
        (statement, settings) => {
            return classifyVariableStatement(statement.asKindOrThrow(SyntaxKind.VariableStatement), settings);
        }
    ],
    [
        SyntaxKind.ExpressionStatement,
        () => {
            return 'expression statement';
        }
    ]
]);

function classifyTopLevelStatement(
    statement: Statement,
    settings: DeadCodeEliminationSettings | undefined
): string | undefined {
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
        return classifier(statement, settings);
    }
    return 'unknown statement';
}

export function classifySideEffects(
    sourceFile: Readonly<SourceFile>,
    settings?: DeadCodeEliminationSettings
): readonly SideEffectStatement[] {
    return sourceFile.getStatements().flatMap((statement) => {
        const kind = classifyTopLevelStatement(statement, settings);
        if (kind === undefined) {
            return [];
        }
        return [{ line: statement.getStartLineNumber(), kind }];
    });
}
