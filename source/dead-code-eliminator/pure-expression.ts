import {
    Node as TsMorphNode,
    SyntaxKind,
    type CallExpression,
    type Expression,
    type NewExpression
} from 'ts-morph';
import type { DeadCodeEliminationSettings } from '../config/dead-code-elimination-settings.ts';
import { computedPropertyNameIsPure } from './computed-property-key-purity.ts';
import { unwrapExpression } from './expression-unwrapping.ts';
import {
    expressionFactIsPure,
    expressionFactOrigin,
    identifierReadFact,
    pureCallableWithOrigin,
    pureLocalObjectFact,
    pureObjectWithOrigin,
    pureValueFact,
    purityCheckerFor,
    unknownFact,
    type ExpressionFact,
    type ExpressionFactResolver
} from './expression-facts.ts';
import {
    arePureCallArguments,
    originIsTrustedPureImport,
    resolveImportedExpressionOrigin,
    resolveImportedExpressionPropertyPath,
    type ImportedExpressionOrigin
} from './imported-expression-origin.ts';
import { externalCallIsPure } from './liveness/external-purity.ts';
import {
    exportHasPureObjectReturnForOrigin,
    exportPurityForOrigin
} from './liveness/external-purity-summary.ts';
import {
    allowedBinaryOperators,
    allowedPrefixUnaryOperators,
    inherentlyPurePropertyKinds,
    pureLeafKinds
} from './syntax-kind-sets.ts';

type PurityRule = (
    expression: Expression,
    factFor: ExpressionFactResolver,
    settings: DeadCodeEliminationSettings | undefined
) => ExpressionFact;
type ExpressionFactContext = {
    readonly cache: WeakMap<Expression, ExpressionFact>;
    readonly settings: DeadCodeEliminationSettings | undefined;
};

const expressionFactCaches = new Map<DeadCodeEliminationSettings | undefined, WeakMap<Expression, ExpressionFact>>();

function expressionFactCacheFor(
    settings: DeadCodeEliminationSettings | undefined
): WeakMap<Expression, ExpressionFact> {
    const stored = expressionFactCaches.get(settings);
    if (stored !== undefined) {
        return stored;
    }
    const cache = new WeakMap<Expression, ExpressionFact>();
    expressionFactCaches.set(settings, cache);
    return cache;
}

function isPureArrayElement(element: Expression, factFor: ExpressionFactResolver): boolean {
    if (TsMorphNode.isOmittedExpression(element)) {
        return true;
    }
    if (TsMorphNode.isSpreadElement(element)) {
        return expressionFactIsPure(factFor(element.getExpression()));
    }
    return expressionFactIsPure(factFor(element));
}

function computedPropertyNameExpression(property: TsMorphNode): Expression | undefined {
    if (
        TsMorphNode.isPropertyAssignment(property) ||
        TsMorphNode.isMethodDeclaration(property) ||
        TsMorphNode.isGetAccessorDeclaration(property) ||
        TsMorphNode.isSetAccessorDeclaration(property)
    ) {
        const name = property.getNameNode();
        if (TsMorphNode.isComputedPropertyName(name)) {
            return name.getExpression();
        }
    }
    return undefined;
}

function propertyAssignmentCreationIsPure(
    property: TsMorphNode,
    factFor: ExpressionFactResolver
): boolean {
    const computedNameExpression = computedPropertyNameExpression(property);
    if (
        computedNameExpression !== undefined &&
        !computedPropertyNameIsPure(computedNameExpression, factFor)
    ) {
        return false;
    }
    if (TsMorphNode.isPropertyAssignment(property)) {
        return expressionFactIsPure(factFor(property.getInitializerOrThrow()));
    }
    if (TsMorphNode.isSpreadAssignment(property)) {
        return expressionFactIsPure(factFor(property.getExpression()));
    }
    return inherentlyPurePropertyKinds.has(property.getKind());
}

function spreadAssignmentSourceIsSafe(
    property: TsMorphNode,
    factFor: ExpressionFactResolver
): boolean {
    if (TsMorphNode.isSpreadAssignment(property)) {
        return factFor(property.getExpression()).type === 'pure-object';
    }
    return true;
}

function createdObjectPropertyIsSafeToSpread(
    property: TsMorphNode,
    factFor: ExpressionFactResolver
): boolean {
    return !TsMorphNode.isGetAccessorDeclaration(property) &&
        !TsMorphNode.isSetAccessorDeclaration(property) &&
        spreadAssignmentSourceIsSafe(property, factFor);
}

function isPureBuiltinCallExpression(
    callTarget: Expression,
    expression: CallExpression,
    factFor: ExpressionFactResolver
): boolean {
    return TsMorphNode.isIdentifier(callTarget) && callTarget.getText() === 'Symbol'
        ? arePureCallArguments(expression.getArguments(), purityCheckerFor(factFor))
        : false;
}

function hasPureAnnotation(expression: Expression): boolean {
    const text = expression.getFullText();
    return text.includes('@__PURE__') || text.includes('#__PURE__');
}

function pureAnnotationMakesCallPure(
    expression: CallExpression | NewExpression,
    factFor: ExpressionFactResolver
): boolean {
    return hasPureAnnotation(expression) && arePureCallArguments(expression.getArguments(), purityCheckerFor(factFor));
}

function appendOriginPath(
    origin: ImportedExpressionOrigin | undefined,
    segment: string
): ImportedExpressionOrigin | undefined {
    return origin === undefined ? undefined : { from: origin.from, path: [ ...origin.path, segment ] };
}

function originForExpressionFact(
    expression: Expression,
    factFor: ExpressionFactResolver
): ImportedExpressionOrigin | undefined {
    return expressionFactOrigin(factFor(expression));
}

function originForCallTarget(
    expression: Expression,
    factFor: ExpressionFactResolver,
    settings: DeadCodeEliminationSettings | undefined
): ImportedExpressionOrigin | undefined {
    const unwrapped = unwrapExpression(expression);
    if (TsMorphNode.isPropertyAccessExpression(unwrapped)) {
        const base = unwrapped.getExpression();
        const baseOrigin = TsMorphNode.isPropertyAccessExpression(unwrapExpression(base))
            ? originForCallTarget(base, factFor, settings)
            : resolveImportedExpressionPropertyPath(base) ?? originForExpressionFact(base, factFor);
        return appendOriginPath(baseOrigin, unwrapped.getName());
    }
    return resolveImportedExpressionPropertyPath(unwrapped) ?? originForExpressionFact(unwrapped, factFor);
}

function externalCallResultFact(
    origin: ImportedExpressionOrigin,
    expression: CallExpression
): ExpressionFact {
    if (exportPurityForOrigin(origin, expression.getSourceFile()) !== 'pure-callable') {
        return unknownFact;
    }
    return exportHasPureObjectReturnForOrigin(origin, expression.getSourceFile())
        ? pureObjectWithOrigin(origin)
        : pureValueFact;
}

function importedCallResultFact(
    origin: ImportedExpressionOrigin | undefined,
    expression: CallExpression,
    factFor: ExpressionFactResolver,
    settings: DeadCodeEliminationSettings | undefined
): ExpressionFact {
    if (origin === undefined || !arePureCallArguments(expression.getArguments(), purityCheckerFor(factFor))) {
        return unknownFact;
    }
    if (originIsTrustedPureImport(origin, settings)) {
        return pureObjectWithOrigin(origin);
    }
    return externalCallResultFact(origin, expression);
}

function callExpressionFact(
    expression: CallExpression,
    factFor: ExpressionFactResolver,
    settings: DeadCodeEliminationSettings | undefined
): ExpressionFact {
    const callTarget = unwrapExpression(expression.getExpression());
    if (
        pureAnnotationMakesCallPure(expression, factFor) ||
        isPureBuiltinCallExpression(callTarget, expression, factFor)
    ) {
        return pureValueFact;
    }
    const importedCallFact = importedCallResultFact(
        originForCallTarget(callTarget, factFor, settings),
        expression,
        factFor,
        settings
    );
    if (expressionFactIsPure(importedCallFact)) {
        return importedCallFact;
    }
    const fallbackCallIsPure = externalCallIsPure(expression, purityCheckerFor(factFor)) ||
        resolveImportedExpressionOrigin(expression, purityCheckerFor(factFor), settings) !== undefined;
    return fallbackCallIsPure ? pureValueFact : unknownFact;
}

function propertyAccessExpressionFact(
    expression: Expression,
    factFor: ExpressionFactResolver,
    settings: DeadCodeEliminationSettings | undefined
): ExpressionFact {
    const origin = originForCallTarget(expression, factFor, settings);
    if (origin === undefined) {
        return unknownFact;
    }
    if (originIsTrustedPureImport(origin, settings)) {
        return pureObjectWithOrigin(origin);
    }
    const exportPurity = exportPurityForOrigin(origin, expression.getSourceFile());
    if (exportPurity === 'pure-callable') {
        return pureCallableWithOrigin(origin);
    }
    return exportPurity === 'pure-object' ? pureObjectWithOrigin(origin) : unknownFact;
}

function constructorNameIsTrusted(
    constructorExpression: Expression,
    settings: DeadCodeEliminationSettings | undefined
): boolean {
    return TsMorphNode.isIdentifier(constructorExpression) &&
        settings?.pureConstructors?.includes(constructorExpression.getText()) === true;
}

function isPureNewExpression(
    expression: NewExpression,
    factFor: ExpressionFactResolver,
    settings: DeadCodeEliminationSettings | undefined
): boolean {
    const constructorExpression = unwrapExpression(expression.getExpression());
    const trustedConstructorCall = constructorNameIsTrusted(constructorExpression, settings) &&
        arePureCallArguments(expression.getArguments(), purityCheckerFor(factFor));
    return pureAnnotationMakesCallPure(expression, factFor) || trustedConstructorCall;
}

function templateExpressionFact(expression: Expression, factFor: ExpressionFactResolver): ExpressionFact {
    const spansArePure = expression
        .asKindOrThrow(SyntaxKind.TemplateExpression)
        .getTemplateSpans()
        .every(function (span) {
            return expressionFactIsPure(factFor(span.getExpression()));
        });
    return spansArePure ? pureValueFact : unknownFact;
}

function arrayLiteralExpressionFact(expression: Expression, factFor: ExpressionFactResolver): ExpressionFact {
    const elementsArePure = expression
        .asKindOrThrow(SyntaxKind.ArrayLiteralExpression)
        .getElements()
        .every(function (element) {
            return isPureArrayElement(element, factFor);
        });
    return elementsArePure ? pureValueFact : unknownFact;
}

function objectLiteralExpressionFact(
    expression: Expression,
    factFor: ExpressionFactResolver
): ExpressionFact {
    const properties = expression
        .asKindOrThrow(SyntaxKind.ObjectLiteralExpression)
        .getProperties();
    if (
        properties.some(function (property) {
            return !propertyAssignmentCreationIsPure(property, factFor);
        })
    ) {
        return unknownFact;
    }
    const hasSpread = properties.some(function (property) {
        return TsMorphNode.isSpreadAssignment(property);
    });
    const spreadSourcesAreSafe = properties.every(function (property) {
        return spreadAssignmentSourceIsSafe(property, factFor);
    });
    if (hasSpread && !spreadSourcesAreSafe) {
        return unknownFact;
    }
    const createdObjectIsSafeToSpread = properties.every(function (property) {
        return createdObjectPropertyIsSafeToSpread(property, factFor);
    });
    return createdObjectIsSafeToSpread
        ? pureLocalObjectFact
        : pureValueFact;
}

function prefixUnaryExpressionFact(expression: Expression, factFor: ExpressionFactResolver): ExpressionFact {
    const unary = expression.asKindOrThrow(SyntaxKind.PrefixUnaryExpression);
    const operandIsPure = allowedPrefixUnaryOperators.has(unary.getOperatorToken()) &&
        expressionFactIsPure(factFor(unary.getOperand()));
    return operandIsPure ? pureValueFact : unknownFact;
}

function binaryExpressionFact(expression: Expression, factFor: ExpressionFactResolver): ExpressionFact {
    const binary = expression.asKindOrThrow(SyntaxKind.BinaryExpression);
    if (!allowedBinaryOperators.has(binary.getOperatorToken().getKind())) {
        return unknownFact;
    }
    return expressionFactIsPure(factFor(binary.getLeft())) && expressionFactIsPure(factFor(binary.getRight()))
        ? pureValueFact
        : unknownFact;
}

function callExpressionRule(
    expression: Expression,
    factFor: ExpressionFactResolver,
    settings: DeadCodeEliminationSettings | undefined
): ExpressionFact {
    return callExpressionFact(expression.asKindOrThrow(SyntaxKind.CallExpression), factFor, settings);
}

function newExpressionFact(
    expression: Expression,
    factFor: ExpressionFactResolver,
    settings: DeadCodeEliminationSettings | undefined
): ExpressionFact {
    return isPureNewExpression(expression.asKindOrThrow(SyntaxKind.NewExpression), factFor, settings)
        ? pureValueFact
        : unknownFact;
}

function literalStructurePurityRuleFor(kind: SyntaxKind): PurityRule | undefined {
    if (kind === SyntaxKind.TemplateExpression) {
        return templateExpressionFact;
    }
    if (kind === SyntaxKind.ArrayLiteralExpression) {
        return arrayLiteralExpressionFact;
    }
    if (kind === SyntaxKind.ObjectLiteralExpression) {
        return objectLiteralExpressionFact;
    }
    return undefined;
}

function memberPurityRuleFor(kind: SyntaxKind): PurityRule | undefined {
    if (kind === SyntaxKind.PropertyAccessExpression) {
        return propertyAccessExpressionFact;
    }
    return undefined;
}

function operationPurityRuleFor(kind: SyntaxKind): PurityRule | undefined {
    if (kind === SyntaxKind.PrefixUnaryExpression) {
        return prefixUnaryExpressionFact;
    }
    if (kind === SyntaxKind.BinaryExpression) {
        return binaryExpressionFact;
    }
    if (kind === SyntaxKind.CallExpression) {
        return callExpressionRule;
    }
    if (kind === SyntaxKind.NewExpression) {
        return newExpressionFact;
    }
    return undefined;
}

function expressionPurityRuleFor(kind: SyntaxKind): PurityRule | undefined {
    return memberPurityRuleFor(kind) ?? literalStructurePurityRuleFor(kind) ?? operationPurityRuleFor(kind);
}

function calculateExpressionFact(
    expression: Expression,
    context: ExpressionFactContext,
    factFor: ExpressionFactResolver
): ExpressionFact {
    const unwrapped = unwrapExpression(expression);
    if (TsMorphNode.isIdentifier(unwrapped)) {
        return identifierReadFact(unwrapped, factFor, context.settings);
    }
    if (pureLeafKinds.has(unwrapped.getKind())) {
        return pureValueFact;
    }
    return expressionPurityRuleFor(unwrapped.getKind())?.(unwrapped, factFor, context.settings) ?? unknownFact;
}

function expressionFactFor(expression: Expression, context: ExpressionFactContext): ExpressionFact {
    const cached = context.cache.get(expression);
    if (cached !== undefined) {
        return cached;
    }
    context.cache.set(expression, unknownFact);
    const factFor: ExpressionFactResolver = function (candidate) {
        return expressionFactFor(candidate, context);
    };
    const fact = calculateExpressionFact(expression, context, factFor);
    context.cache.set(expression, fact);
    return fact;
}

export function isPureExpression(expression: Expression, settings: DeadCodeEliminationSettings | undefined): boolean {
    return expressionFactIsPure(expressionFactFor(expression, { cache: expressionFactCacheFor(settings), settings }));
}
