import { constant } from 'remeda';
import { match } from 'ts-pattern';
import {
    Node as TypeScriptMorphNode,
    SyntaxKind,
    type CallExpression,
    type Expression,
    type NewExpression
} from 'ts-morph';
import {
    classExpressionFact,
    expressionFactIsPure,
    identifierReadFact,
    createEvaluatedFacts,
    pureLocalObjectFact,
    pureValueFact,
    purePrimitiveFact,
    purityCheckerFor,
    unknownFact,
    type ExpressionFact,
    type ExpressionFactResolver
} from './expression-facts.ts';
import { computedPropertyNameIsPure } from './computed-property-key-purity.ts';
import { unwrapExpression } from './expression-unwrapping.ts';
import type { PurityContext, ExpressionPurityChecker } from './imported-expression-origin.ts';
import { annotationTrustsCall, settingsTrustConstruction } from './trusted-calls.ts';
import {
    importedCallResultFact,
    originForCallTarget,
    propertyAccessExpressionFact
} from './imported-expression-facts.ts';
import {
    allowedBinaryOperators,
    allowedPrefixUnaryOperators,
    inherentlyPurePropertyKinds,
    pureLeafKinds,
    purePrimitiveLeafKinds,
    strictEqualityOperators,
    shortCircuitOperators
} from './syntax-kind-sets.ts';

type PurityRule = (
    expression: Expression,
    factFor: ExpressionFactResolver,
    context: PurityContext
) => ExpressionFact;

type ExpressionFactContext = {
    readonly cache: WeakMap<Expression, ExpressionFact>;
    readonly purity: PurityContext;
    readonly evaluatedFact: ExpressionFactResolver;
};

function isPureArrayElement(element: Expression, factFor: ExpressionFactResolver): boolean {
    if (TypeScriptMorphNode.isOmittedExpression(element)) {
        return true;
    }
    return expressionFactIsPure(factFor(element));
}

function computedPropertyNameExpression(property: TypeScriptMorphNode): Expression | undefined {
    if (
        TypeScriptMorphNode.isPropertyAssignment(property) ||
        TypeScriptMorphNode.isMethodDeclaration(property) ||
        TypeScriptMorphNode.isGetAccessorDeclaration(property) ||
        TypeScriptMorphNode.isSetAccessorDeclaration(property)
    ) {
        const name = property.getNameNode();
        if (TypeScriptMorphNode.isComputedPropertyName(name)) {
            return name.getExpression();
        }
    }
    return undefined;
}

function propertyAssignmentCreationIsPure(
    property: TypeScriptMorphNode,
    factFor: ExpressionFactResolver,
    context: PurityContext
): boolean {
    const computedNameExpression = computedPropertyNameExpression(property);
    if (
        computedNameExpression !== undefined &&
        !computedPropertyNameIsPure(computedNameExpression, context.resolveRuntimeModule)
    ) {
        return false;
    }
    if (TypeScriptMorphNode.isPropertyAssignment(property)) {
        return expressionFactIsPure(factFor(property.getInitializerOrThrow()));
    }
    if (TypeScriptMorphNode.isSpreadAssignment(property)) {
        return expressionFactIsPure(factFor(property.getExpression()));
    }
    return inherentlyPurePropertyKinds.has(property.getKind());
}

function spreadAssignmentSourceIsSafe(
    property: TypeScriptMorphNode,
    factFor: ExpressionFactResolver
): boolean {
    if (TypeScriptMorphNode.isSpreadAssignment(property)) {
        return factFor(property.getExpression()).type === 'pure-object';
    }
    return true;
}

function createdObjectPropertyIsSafeToSpread(
    property: TypeScriptMorphNode,
    factFor: ExpressionFactResolver
): boolean {
    return !TypeScriptMorphNode.isGetAccessorDeclaration(property) &&
        !TypeScriptMorphNode.isSetAccessorDeclaration(property) &&
        spreadAssignmentSourceIsSafe(property, factFor);
}

function callExpressionFact(
    expression: CallExpression,
    factFor: ExpressionFactResolver,
    context: PurityContext
): ExpressionFact {
    const callTarget = unwrapExpression(expression.getExpression());
    if (annotationTrustsCall(expression, purityCheckerFor(factFor))) {
        return pureValueFact;
    }
    const importedCallFact = importedCallResultFact(
        originForCallTarget(callTarget, factFor, context),
        expression,
        factFor,
        context
    );
    return importedCallFact;
}

function isPureNewExpression(
    expression: NewExpression,
    factFor: ExpressionFactResolver,
    context: PurityContext
): boolean {
    const isPure = purityCheckerFor(factFor);
    return annotationTrustsCall(expression, isPure) || settingsTrustConstruction(expression, context, isPure);
}

function templateExpressionFact(expression: Expression, factFor: ExpressionFactResolver): ExpressionFact {
    const spansArePure = expression
        .asKindOrThrow(SyntaxKind.TemplateExpression)
        .getTemplateSpans()
        .every(function (span) {
            return factFor(span.getExpression()).type === 'pure-primitive';
        });
    return spansArePure ? purePrimitiveFact : unknownFact;
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
    factFor: ExpressionFactResolver,
    context: PurityContext
): ExpressionFact {
    const properties = expression
        .asKindOrThrow(SyntaxKind.ObjectLiteralExpression)
        .getProperties();
    if (
        properties.some(function (property) {
            return !propertyAssignmentCreationIsPure(property, factFor, context);
        })
    ) {
        return unknownFact;
    }
    const spreadSourcesAreSafe = properties.every(function (property) {
        return spreadAssignmentSourceIsSafe(property, factFor);
    });
    if (!spreadSourcesAreSafe) {
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
    const operand = factFor(unary.getOperand());
    const operandIsSafe = unary.getOperatorToken() === SyntaxKind.ExclamationToken
        ? expressionFactIsPure(operand)
        : operand.type === 'pure-primitive';
    const operandIsPure = allowedPrefixUnaryOperators.has(unary.getOperatorToken()) &&
        operandIsSafe;
    return operandIsPure ? purePrimitiveFact : unknownFact;
}

function nonCoerciveBinaryResultFact(operator: SyntaxKind): ExpressionFact {
    if (strictEqualityOperators.has(operator)) {
        return purePrimitiveFact;
    }
    return shortCircuitOperators.has(operator) ? pureValueFact : unknownFact;
}

function binaryPureOperandsFact(operator: SyntaxKind, left: ExpressionFact, right: ExpressionFact): ExpressionFact {
    return left.type === 'pure-primitive' && right.type === 'pure-primitive'
        ? purePrimitiveFact
        : nonCoerciveBinaryResultFact(operator);
}

function binaryExpressionFact(expression: Expression, factFor: ExpressionFactResolver): ExpressionFact {
    const binary = expression.asKindOrThrow(SyntaxKind.BinaryExpression);
    if (!allowedBinaryOperators.has(binary.getOperatorToken().getKind())) {
        return unknownFact;
    }
    const left = factFor(binary.getLeft());
    const right = factFor(binary.getRight());
    return expressionFactIsPure(left) && expressionFactIsPure(right)
        ? binaryPureOperandsFact(binary.getOperatorToken().getKind(), left, right)
        : unknownFact;
}

function callExpressionRule(
    expression: Expression,
    factFor: ExpressionFactResolver,
    context: PurityContext
): ExpressionFact {
    return callExpressionFact(expression.asKindOrThrow(SyntaxKind.CallExpression), factFor, context);
}

function newExpressionFact(
    expression: Expression,
    factFor: ExpressionFactResolver,
    context: PurityContext
): ExpressionFact {
    return isPureNewExpression(expression.asKindOrThrow(SyntaxKind.NewExpression), factFor, context)
        ? pureValueFact
        : unknownFact;
}

function voidExpressionFact(expression: Expression, factFor: ExpressionFactResolver): ExpressionFact {
    const operand = expression.asKindOrThrow(SyntaxKind.VoidExpression).getExpression();
    return expressionFactIsPure(factFor(operand)) ? purePrimitiveFact : unknownFact;
}

function expressionPurityRuleFor(kind: SyntaxKind): PurityRule | undefined {
    return match<number>(kind)
        .with(SyntaxKind.ClassExpression, constant(classExpressionFact))
        .with(SyntaxKind.TemplateExpression, constant(templateExpressionFact))
        .with(SyntaxKind.ArrayLiteralExpression, constant(arrayLiteralExpressionFact))
        .with(SyntaxKind.ObjectLiteralExpression, constant(objectLiteralExpressionFact))
        .with(SyntaxKind.PropertyAccessExpression, constant(propertyAccessExpressionFact))
        .with(SyntaxKind.VoidExpression, constant(voidExpressionFact))
        .with(SyntaxKind.PrefixUnaryExpression, constant(prefixUnaryExpressionFact))
        .with(SyntaxKind.BinaryExpression, constant(binaryExpressionFact))
        .with(SyntaxKind.CallExpression, constant(callExpressionRule))
        .with(SyntaxKind.NewExpression, constant(newExpressionFact))
        .otherwise(constant(undefined));
}

function calculateExpressionFact(
    expression: Expression,
    context: ExpressionFactContext,
    factFor: ExpressionFactResolver
): ExpressionFact {
    const unwrapped = unwrapExpression(expression);
    if (TypeScriptMorphNode.isIdentifier(unwrapped)) {
        return identifierReadFact(unwrapped, factFor, context.purity);
    }
    if (purePrimitiveLeafKinds.has(unwrapped.getKind())) {
        return purePrimitiveFact;
    }
    if (pureLeafKinds.has(unwrapped.getKind())) {
        return pureValueFact;
    }
    return expressionPurityRuleFor(unwrapped.getKind())?.(unwrapped, factFor, context.purity) ?? unknownFact;
}

function cacheCalculatedExpressionFact(
    expression: Expression,
    context: ExpressionFactContext,
    factFor: ExpressionFactResolver
): ExpressionFact {
    context.cache.set(expression, unknownFact);
    const syntacticFact = calculateExpressionFact(expression, context, factFor);
    const fact = expressionFactIsPure(syntacticFact)
        ? syntacticFact
        : context.evaluatedFact(unwrapExpression(expression));
    context.cache.set(expression, fact);
    return fact;
}

function expressionFactFor(expression: Expression, context: ExpressionFactContext): ExpressionFact {
    const factFor: ExpressionFactResolver = function (candidate) {
        return expressionFactFor(candidate, context);
    };
    return context.cache.get(expression) ?? cacheCalculatedExpressionFact(expression, context, factFor);
}

export function createPreparedExpressionPurityChecker(
    settings: PurityContext['settings'],
    resolveModule: PurityContext['resolveRuntimeModule']
): ExpressionPurityChecker {
    const context: ExpressionFactContext = {
        cache: new WeakMap(),
        purity: { settings, resolveRuntimeModule: resolveModule },
        evaluatedFact: createEvaluatedFacts()
    };
    return function (expression) {
        return expressionFactIsPure(expressionFactFor(expression, context));
    };
}

export function createExpressionPurityChecker(
    settings: PurityContext['settings'],
    resolveModule: PurityContext['resolveRuntimeModule']
): ExpressionPurityChecker {
    return function (expression) {
        return createPreparedExpressionPurityChecker(settings, resolveModule)(expression);
    };
}
