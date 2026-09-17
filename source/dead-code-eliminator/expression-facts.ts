import {
    Node as TsMorphNode,
    SyntaxKind,
    VariableDeclarationKind,
    type Expression,
    type Identifier,
    type Node as TsMorphNodeType,
    type SourceFile,
    type VariableDeclaration
} from 'ts-morph';
import type { DeadCodeEliminationSettings } from '../config/dead-code-elimination-settings.ts';
import {
    originIsTrustedPureImport,
    resolveImportedExpressionPath,
    type ExpressionPurityChecker,
    type ImportedExpressionOrigin
} from './imported-expression-origin.ts';
import { unwrapExpression } from './expression-unwrapping.ts';
import { exportPurityForOrigin } from './liveness/external-purity-summary.ts';

type PureCallableFact = { readonly origin: ImportedExpressionOrigin | undefined; readonly type: 'pure-callable'; };
type PureObjectFact = { readonly origin: ImportedExpressionOrigin | undefined; readonly type: 'pure-object'; };
type PureValueFact = { readonly type: 'pure-value'; };
type UnknownExpressionFact = { readonly type: 'unknown'; };

export type ExpressionFact = PureCallableFact | PureObjectFact | PureValueFact | UnknownExpressionFact;

export type ExpressionFactResolver = (expression: Expression) => ExpressionFact;
type MutationRecord = { readonly name: string; readonly start: number; };

export const pureValueFact: ExpressionFact = { type: 'pure-value' };
export const pureLocalObjectFact: ExpressionFact = { type: 'pure-object', origin: undefined };
export const unknownFact: ExpressionFact = { type: 'unknown' };
const mutationRecordsBySourceFile = new WeakMap<SourceFile, readonly MutationRecord[]>();

export function expressionFactIsPure(fact: ExpressionFact): boolean {
    return fact.type !== 'unknown';
}

export function expressionFactOrigin(fact: ExpressionFact): ImportedExpressionOrigin | undefined {
    return fact.type === 'pure-object' || fact.type === 'pure-callable' ? fact.origin : undefined;
}

export function purityCheckerFor(factFor: ExpressionFactResolver): ExpressionPurityChecker {
    return function (candidate) {
        return expressionFactIsPure(factFor(candidate));
    };
}

export function pureObjectWithOrigin(origin: ImportedExpressionOrigin): ExpressionFact {
    return { type: 'pure-object', origin };
}

export function pureCallableWithOrigin(origin: ImportedExpressionOrigin): ExpressionFact {
    return { type: 'pure-callable', origin };
}

function importedExpressionFact(
    origin: ImportedExpressionOrigin,
    expression: Expression,
    settings: DeadCodeEliminationSettings | undefined
): ExpressionFact {
    if (originIsTrustedPureImport(origin, settings)) {
        return pureObjectWithOrigin(origin);
    }
    if (origin.from.startsWith('.') || origin.from.startsWith('/')) {
        return pureValueFact;
    }
    const exportPurity = exportPurityForOrigin(origin, expression.getSourceFile());
    if (exportPurity === 'pure-callable') {
        return pureCallableWithOrigin(origin);
    }
    if (exportPurity === 'pure-object') {
        return pureObjectWithOrigin(origin);
    }
    return pureValueFact;
}

const alwaysAvailableDeclarationKinds = new Set<SyntaxKind>([
    SyntaxKind.FunctionDeclaration,
    SyntaxKind.ImportClause,
    SyntaxKind.ImportSpecifier,
    SyntaxKind.NamespaceImport,
    SyntaxKind.Parameter
]);
const orderedDeclarationKinds = new Set<SyntaxKind>([
    SyntaxKind.ClassDeclaration,
    SyntaxKind.EnumDeclaration,
    SyntaxKind.VariableDeclaration
]);
const importedOriginDeclarationKinds = new Set<SyntaxKind>([
    SyntaxKind.ImportClause,
    SyntaxKind.ImportSpecifier,
    SyntaxKind.NamespaceImport
]);
const assignmentOperatorKinds = new Set<SyntaxKind>([
    SyntaxKind.EqualsToken,
    SyntaxKind.PlusEqualsToken,
    SyntaxKind.MinusEqualsToken,
    SyntaxKind.AsteriskEqualsToken,
    SyntaxKind.AsteriskAsteriskEqualsToken,
    SyntaxKind.SlashEqualsToken,
    SyntaxKind.PercentEqualsToken,
    SyntaxKind.LessThanLessThanEqualsToken,
    SyntaxKind.GreaterThanGreaterThanEqualsToken,
    SyntaxKind.GreaterThanGreaterThanGreaterThanEqualsToken,
    SyntaxKind.AmpersandEqualsToken,
    SyntaxKind.BarEqualsToken,
    SyntaxKind.CaretEqualsToken,
    SyntaxKind.AmpersandAmpersandEqualsToken,
    SyntaxKind.BarBarEqualsToken,
    SyntaxKind.QuestionQuestionEqualsToken
]);

function declarationIsAvailableBeforeRead(declaration: TsMorphNodeType, expression: Identifier): boolean {
    return Math.sign(expression.getStart() - declaration.getEnd()) === 1;
}

function declarationMakesIdentifierReadPure(declaration: TsMorphNodeType, expression: Identifier): boolean {
    const kind = declaration.getKind();
    if (alwaysAvailableDeclarationKinds.has(kind)) {
        return true;
    }
    if (orderedDeclarationKinds.has(kind)) {
        return declarationIsAvailableBeforeRead(declaration, expression);
    }

    return false;
}

function identifierDeclarations(expression: Identifier): readonly TsMorphNodeType[] {
    const symbol = expression.getSymbol();
    return symbol?.getDeclarations() ?? [];
}

function rootMutationIdentifier(expression: Expression): Identifier | undefined {
    const unwrapped = unwrapExpression(expression);
    if (TsMorphNode.isIdentifier(unwrapped)) {
        return unwrapped;
    }
    if (TsMorphNode.isPropertyAccessExpression(unwrapped) || TsMorphNode.isElementAccessExpression(unwrapped)) {
        return rootMutationIdentifier(unwrapped.getExpression());
    }
    return undefined;
}

function binaryExpressionMutationRecord(expression: TsMorphNode): MutationRecord | undefined {
    if (!TsMorphNode.isBinaryExpression(expression)) {
        return undefined;
    }
    if (!assignmentOperatorKinds.has(expression.getOperatorToken().getKind())) {
        return undefined;
    }
    const identifier = rootMutationIdentifier(expression.getLeft());
    return identifier === undefined ? undefined : { name: identifier.getText(), start: expression.getStart() };
}

function updateExpressionMutationRecord(expression: TsMorphNode): MutationRecord | undefined {
    if (!TsMorphNode.isPrefixUnaryExpression(expression) && !TsMorphNode.isPostfixUnaryExpression(expression)) {
        return undefined;
    }
    const operator = expression.getOperatorToken();
    if (operator !== SyntaxKind.PlusPlusToken && operator !== SyntaxKind.MinusMinusToken) {
        return undefined;
    }
    const identifier = rootMutationIdentifier(expression.getOperand());
    return identifier === undefined ? undefined : { name: identifier.getText(), start: expression.getStart() };
}

function mutationRecordForNode(node: TsMorphNode): MutationRecord | undefined {
    return binaryExpressionMutationRecord(node) ?? updateExpressionMutationRecord(node);
}

function collectMutationRecords(sourceFile: SourceFile): readonly MutationRecord[] {
    const records: MutationRecord[] = [];
    for (const node of sourceFile.getDescendants()) {
        const record = mutationRecordForNode(node);
        if (record !== undefined) {
            records.push(record);
        }
    }
    return records;
}

function mutationRecordsForSourceFile(sourceFile: SourceFile): readonly MutationRecord[] {
    const stored = mutationRecordsBySourceFile.get(sourceFile);
    if (stored !== undefined) {
        return stored;
    }
    const records = collectMutationRecords(sourceFile);
    mutationRecordsBySourceFile.set(sourceFile, records);
    return records;
}

function mutationRecordTargetsDeclaration(
    record: MutationRecord,
    declaration: VariableDeclaration,
    read: Identifier
): boolean {
    return record.name === declaration.getName() &&
        record.start > declaration.getEnd() &&
        record.start < read.getStart();
}

function declarationIsMutatedBeforeRead(declaration: VariableDeclaration, read: Identifier): boolean {
    return mutationRecordsForSourceFile(read.getSourceFile()).some(function (record) {
        return mutationRecordTargetsDeclaration(record, declaration, read);
    });
}

function variableDeclarationIsConst(declaration: VariableDeclaration): boolean {
    const statement = declaration.getFirstAncestorByKindOrThrow(SyntaxKind.VariableStatement);
    return statement.getDeclarationKind() === VariableDeclarationKind.Const;
}

function factNeedsMutationCheck(fact: ExpressionFact): boolean {
    return fact.type !== 'pure-value' && fact.type !== 'unknown';
}

function variableInitializerFact(
    declaration: VariableDeclaration,
    factFor: ExpressionFactResolver
): ExpressionFact {
    const initializer = declaration.getInitializer();
    return initializer === undefined ? pureValueFact : factFor(initializer);
}

function variableDeclarationFact(
    declaration: VariableDeclaration,
    expression: Identifier,
    factFor: ExpressionFactResolver
): ExpressionFact {
    if (!declarationIsAvailableBeforeRead(declaration, expression)) {
        return unknownFact;
    }
    if (!variableDeclarationIsConst(declaration)) {
        return pureValueFact;
    }
    const initializerFact = variableInitializerFact(declaration, factFor);
    if (!factNeedsMutationCheck(initializerFact)) {
        return initializerFact;
    }
    return declarationIsMutatedBeforeRead(declaration, expression) ? pureValueFact : initializerFact;
}

function importedOriginForIdentifierDeclaration(
    declaration: TsMorphNodeType,
    expression: Identifier
): ImportedExpressionOrigin | undefined {
    return importedOriginDeclarationKinds.has(declaration.getKind())
        ? resolveImportedExpressionPath(expression)
        : undefined;
}

function declarationFactForIdentifier(
    declaration: TsMorphNodeType,
    expression: Identifier,
    factFor: ExpressionFactResolver,
    settings: DeadCodeEliminationSettings | undefined
): ExpressionFact {
    const origin = importedOriginForIdentifierDeclaration(declaration, expression);
    if (origin !== undefined) {
        return importedExpressionFact(origin, expression, settings);
    }
    if (TsMorphNode.isVariableDeclaration(declaration)) {
        return variableDeclarationFact(declaration, expression, factFor);
    }
    return declarationMakesIdentifierReadPure(declaration, expression) ? pureValueFact : unknownFact;
}

export function identifierReadFact(
    expression: Identifier,
    factFor: ExpressionFactResolver,
    settings: DeadCodeEliminationSettings | undefined
): ExpressionFact {
    if (expression.getText() === 'undefined') {
        return pureValueFact;
    }
    for (const declaration of identifierDeclarations(expression)) {
        const fact = declarationFactForIdentifier(declaration, expression, factFor, settings);
        if (expressionFactIsPure(fact)) {
            return fact;
        }
    }
    return unknownFact;
}
