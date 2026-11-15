import {
    Node as TypeScriptMorphNode,
    SyntaxKind,
    VariableDeclarationKind,
    type Expression,
    type CallExpression,
    type NewExpression,
    type Identifier,
    type Node as TypeScriptMorphNodeType,
    type SourceFile,
    type VariableDeclaration
} from 'ts-morph';
import { hasClassImpurity } from './class-purity.ts';
import { resolveComputedPropertyKey } from './computed-property-key-purity.ts';
import {
    originIsTrustedPureImport,
    resolveImportedExpressionPath,
    type PurityContext,
    type ExpressionPurityChecker,
    type ImportedExpressionOrigin
} from './imported-expression-origin.ts';
import { unwrapExpression } from './expression-unwrapping.ts';
import { evaluateLocalCall, createBoundedEvaluator } from './evaluation/local-call.ts';
import { expressionBindingShapeIsStable } from './binding-stability.ts';
import { createRuntimeCallablePurityProof } from './runtime-call-purity.ts';
import { exportPurityForOrigin } from './liveness/external-purity-summary.ts';

type PureCallableFact = { readonly origin: ImportedExpressionOrigin | undefined; readonly type: 'pure-callable'; };
type PureObjectFact = { readonly origin: ImportedExpressionOrigin | undefined; readonly type: 'pure-object'; };
type PureValueFact = { readonly origin: undefined; readonly type: 'pure-value'; };
type PurePrimitiveFact = { readonly origin: undefined; readonly type: 'pure-primitive'; };
type UnknownExpressionFact = { readonly origin: undefined; readonly type: 'unknown'; };

type PureExpressionFact = PureCallableFact | PureObjectFact | PurePrimitiveFact | PureValueFact;
export type ExpressionFact = PureExpressionFact | UnknownExpressionFact;

export type ExpressionFactResolver = (expression: Expression) => ExpressionFact;
type MutationRecord = { readonly name: string; readonly start: number; };

export const pureValueFact: ExpressionFact = { origin: undefined, type: 'pure-value' };
export const purePrimitiveFact: ExpressionFact = { origin: undefined, type: 'pure-primitive' };
export const pureLocalObjectFact: ExpressionFact = { type: 'pure-object', origin: undefined };
export const unknownFact: ExpressionFact = { origin: undefined, type: 'unknown' };

export function localCallFact(expression: CallExpression): ExpressionFact {
    return evaluateLocalCall(expression) === undefined ? unknownFact : purePrimitiveFact;
}

export function localConstructionFact(expression: NewExpression): ExpressionFact {
    const value = createBoundedEvaluator(expression.getSourceFile(), new Map())(expression);
    return value === undefined ? unknownFact : pureValueFact;
}

export function expressionFactIsPure(fact: ExpressionFact): boolean {
    return [ 'pure-callable', 'pure-object', 'pure-value', 'pure-primitive' ].includes(fact.type);
}

export function expressionFactOrigin(fact: ExpressionFact): ImportedExpressionOrigin | undefined {
    return fact.origin;
}

export function purityCheckerFor(factFor: ExpressionFactResolver): ExpressionPurityChecker {
    return function (candidate) {
        return expressionFactIsPure(factFor(candidate));
    };
}

export function classExpressionFact(
    expression: Expression,
    factFor: ExpressionFactResolver,
    context: PurityContext
): ExpressionFact {
    const impure = hasClassImpurity(
        expression.asKindOrThrow(SyntaxKind.ClassExpression),
        purityCheckerFor(factFor),
        function (key) {
            return resolveComputedPropertyKey(key, context.resolveRuntimeModule);
        }
    );
    return impure ? unknownFact : pureValueFact;
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
    context: PurityContext
): ExpressionFact {
    if (originIsTrustedPureImport(origin, context.settings)) {
        return pureObjectWithOrigin(origin);
    }
    if (!expressionBindingShapeIsStable(expression, createRuntimeCallablePurityProof(context.resolveRuntimeModule))) {
        return pureValueFact;
    }
    const exportPurity = exportPurityForOrigin(origin, expression.getSourceFile(), context.resolveRuntimeModule);
    if (exportPurity === 'pure-callable') {
        return pureCallableWithOrigin(origin);
    }
    if (exportPurity === 'pure-object') {
        return pureObjectWithOrigin(origin);
    }
    return pureValueFact;
}

function syntaxKindIsOneOf(kind: SyntaxKind, ...candidates: readonly SyntaxKind[]): boolean {
    return candidates.includes(kind);
}

function declarationKindIsAlwaysAvailable(kind: SyntaxKind): boolean {
    return syntaxKindIsOneOf(
        kind,
        SyntaxKind.FunctionDeclaration,
        SyntaxKind.ImportClause,
        SyntaxKind.ImportSpecifier,
        SyntaxKind.NamespaceImport,
        SyntaxKind.Parameter
    );
}

function declarationKindIsOrdered(kind: SyntaxKind): boolean {
    return syntaxKindIsOneOf(
        kind,
        SyntaxKind.ClassDeclaration,
        SyntaxKind.EnumDeclaration,
        SyntaxKind.VariableDeclaration
    );
}

function declarationKindHasImportedOrigin(kind: SyntaxKind): boolean {
    return syntaxKindIsOneOf(
        kind,
        SyntaxKind.ImportClause,
        SyntaxKind.ImportSpecifier,
        SyntaxKind.NamespaceImport
    );
}

function operatorKindIsAssignment(kind: SyntaxKind): boolean {
    return syntaxKindIsOneOf(
        kind,
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
    );
}

function declarationIsAvailableBeforeRead(declaration: TypeScriptMorphNodeType, expression: Identifier): boolean {
    return Math.sign(expression.getStart() - declaration.getEnd()) === 1;
}

function declarationMakesIdentifierReadPure(declaration: TypeScriptMorphNodeType, expression: Identifier): boolean {
    const kind = declaration.getKind();
    if (declarationKindIsAlwaysAvailable(kind)) {
        return true;
    }
    if (declarationKindIsOrdered(kind)) {
        return declarationIsAvailableBeforeRead(declaration, expression);
    }

    return false;
}

function identifierDeclarations(expression: Identifier): readonly TypeScriptMorphNodeType[] {
    const symbol = expression.getSymbol();
    return symbol?.getDeclarations() ?? [];
}

function rootMutationIdentifier(expression: Expression): Identifier | undefined {
    const unwrapped = unwrapExpression(expression);
    if (TypeScriptMorphNode.isIdentifier(unwrapped)) {
        return unwrapped;
    }
    if (
        TypeScriptMorphNode.isPropertyAccessExpression(unwrapped) ||
        TypeScriptMorphNode.isElementAccessExpression(unwrapped)
    ) {
        return rootMutationIdentifier(unwrapped.getExpression());
    }
    return undefined;
}

function binaryExpressionMutationRecord(expression: TypeScriptMorphNode): MutationRecord | undefined {
    if (!TypeScriptMorphNode.isBinaryExpression(expression)) {
        return undefined;
    }
    if (!operatorKindIsAssignment(expression.getOperatorToken().getKind())) {
        return undefined;
    }
    const identifier = rootMutationIdentifier(expression.getLeft());
    return identifier === undefined ? undefined : { name: identifier.getText(), start: expression.getStart() };
}

function updateExpressionMutationRecord(expression: TypeScriptMorphNode): MutationRecord | undefined {
    if (
        !TypeScriptMorphNode.isPrefixUnaryExpression(expression) &&
        !TypeScriptMorphNode.isPostfixUnaryExpression(expression)
    ) {
        return undefined;
    }
    const operator = expression.getOperatorToken();
    if (operator !== SyntaxKind.PlusPlusToken && operator !== SyntaxKind.MinusMinusToken) {
        return undefined;
    }
    const identifier = rootMutationIdentifier(expression.getOperand());
    return identifier === undefined ? undefined : { name: identifier.getText(), start: expression.getStart() };
}

function mutationRecordForNode(node: TypeScriptMorphNode): MutationRecord | undefined {
    return binaryExpressionMutationRecord(node) ?? updateExpressionMutationRecord(node);
}

function* collectMutationRecords(sourceFile: SourceFile): Generator<MutationRecord> {
    for (const node of sourceFile.getDescendants()) {
        const record = mutationRecordForNode(node);
        if (record !== undefined) {
            yield record;
        }
    }
}

function mutationRecordTargetsDeclaration(
    record: MutationRecord,
    declaration: VariableDeclaration,
    read: Identifier
): boolean {
    return record.name === declaration.getName() &&
        Math.sign(record.start - declaration.getEnd()) === 1 &&
        Math.sign(read.getStart() - record.start) === 1;
}

function declarationIsMutatedBeforeRead(declaration: VariableDeclaration, read: Identifier): boolean {
    for (const record of collectMutationRecords(read.getSourceFile())) {
        if (mutationRecordTargetsDeclaration(record, declaration, read)) {
            return true;
        }
    }
    return false;
}

function variableDeclarationIsConst(declaration: VariableDeclaration): boolean {
    const list = declaration.getFirstAncestorByKind(SyntaxKind.VariableDeclarationList);
    return list?.getDeclarationKind() === VariableDeclarationKind.Const;
}

function factNeedsMutationCheck(fact: ExpressionFact): boolean {
    return fact.type === 'pure-object' || fact.type === 'pure-callable';
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
    declaration: TypeScriptMorphNodeType,
    expression: Identifier
): ImportedExpressionOrigin | undefined {
    return declarationKindHasImportedOrigin(declaration.getKind())
        ? resolveImportedExpressionPath(expression)
        : undefined;
}

function declarationIsRuntimeLocal(declaration: TypeScriptMorphNodeType, expression: Identifier): boolean {
    const ambient = [ declaration, ...declaration.getAncestors() ].some(function (candidate) {
        return TypeScriptMorphNode.isAmbientable(candidate) && candidate.isAmbient();
    });
    return declaration.getSourceFile() === expression.getSourceFile() && !ambient;
}

function declarationFactForIdentifier(
    declaration: TypeScriptMorphNodeType,
    expression: Identifier,
    factFor: ExpressionFactResolver,
    context: PurityContext
): ExpressionFact {
    if (!declarationIsRuntimeLocal(declaration, expression)) {
        return unknownFact;
    }
    const origin = importedOriginForIdentifierDeclaration(declaration, expression);
    if (origin !== undefined) {
        return importedExpressionFact(origin, expression, context);
    }
    if (TypeScriptMorphNode.isVariableDeclaration(declaration)) {
        return variableDeclarationFact(declaration, expression, factFor);
    }
    return declarationMakesIdentifierReadPure(declaration, expression) ? pureValueFact : unknownFact;
}

export function identifierReadFact(
    expression: Identifier,
    factFor: ExpressionFactResolver,
    context: PurityContext
): ExpressionFact {
    const declarations = identifierDeclarations(expression);
    if (expression.getText() === 'undefined' && declarations.length === 0) {
        return purePrimitiveFact;
    }
    for (const declaration of declarations) {
        const fact = declarationFactForIdentifier(declaration, expression, factFor, context);
        if (expressionFactIsPure(fact)) {
            return fact;
        }
    }
    return unknownFact;
}
