import {
    Node as TypeScriptMorphNode,
    SyntaxKind,
    type Expression,
    type ObjectLiteralExpression,
    type ObjectLiteralElementLike,
    type ClassDeclaration,
    type SourceFile,
    type NewExpression
} from 'ts-morph';
import { match } from 'ts-pattern';
import { unwrapExpression } from '../expression-unwrapping.ts';
import { returnCreationIsPure } from '../liveness/builder-return.ts';
import { hasClassImpurity, type ClassPropertyKeyResolver } from '../class-purity.ts';
import { arePureCallArguments, type ExpressionPurityChecker } from '../imported-expression-origin.ts';
import { shortCircuitOperators } from '../syntax-kind-sets.ts';
import { createSourceEvaluation } from './constant-evaluation.ts';
import { createPureCallResolver } from './pure-local-call.ts';
import { resolveLocalConstruction } from './construction-target.ts';

type UnusedValueEffect = Expression | ObjectLiteralElementLike;
export type UnusedValueResolver = (
    expression: ClassDeclaration | Expression
) => readonly UnusedValueEffect[] | undefined;

function unusedSequenceEffects(
    expression: Expression,
    resolveUnused: UnusedValueResolver
): readonly UnusedValueEffect[] | undefined {
    if (
        !TypeScriptMorphNode.isBinaryExpression(expression) ||
        expression.getOperatorToken().getKind() !== SyntaxKind.CommaToken
    ) {
        return undefined;
    }
    const left = expression.getLeft();
    const right = expression.getRight();
    return [ ...resolveUnused(left) ?? [ left ], ...resolveUnused(right) ?? [ right ] ];
}

function unusedLogicalEffects(
    expression: Expression,
    resolveUnused: UnusedValueResolver
): readonly UnusedValueEffect[] | undefined {
    if (
        !TypeScriptMorphNode.isBinaryExpression(expression) ||
        !shortCircuitOperators.has(expression.getOperatorToken().getKind())
    ) {
        return undefined;
    }
    const left = expression.getLeft();
    return resolveUnused(expression.getRight())?.length === 0 ? resolveUnused(left) ?? [ left ] : undefined;
}

function unusedUnaryEffects(
    expression: Expression,
    resolveUnused: UnusedValueResolver
): readonly UnusedValueEffect[] | undefined {
    if (TypeScriptMorphNode.isVoidExpression(expression)) {
        const operand = expression.getExpression();
        return resolveUnused(operand) ?? [ operand ];
    }
    if (
        TypeScriptMorphNode.isPrefixUnaryExpression(expression) &&
        expression.getOperatorToken() === SyntaxKind.ExclamationToken
    ) {
        const operand = expression.getOperand();
        return resolveUnused(operand) ?? [ operand ];
    }
    return undefined;
}

function unusedConstructionEffects(
    expression: NewExpression,
    isPure: ExpressionPurityChecker,
    propertyKeyFor: ClassPropertyKeyResolver
): readonly Expression[] | undefined {
    const construction = resolveLocalConstruction(expression);
    if (construction === undefined) {
        return undefined;
    }
    const { definition } = construction;
    return [
        ...definition !== undefined && hasClassImpurity(definition, isPure, propertyKeyFor) ? [ definition ] : [],
        ...construction.arguments
    ];
}

function propertyInitializer(property: ObjectLiteralElementLike): Expression | undefined {
    if (TypeScriptMorphNode.isPropertyAssignment(property)) {
        return property.getInitializerOrThrow();
    }
    return TypeScriptMorphNode.isShorthandPropertyAssignment(property) ? property.getNameNode() : undefined;
}

function unusedInitializerEffects(
    property: ObjectLiteralElementLike,
    resolveUnused: UnusedValueResolver
): readonly UnusedValueEffect[] {
    const value = propertyInitializer(property);
    if (value === undefined) {
        return [];
    }
    const effects = resolveUnused(value) ?? [ value ];
    return TypeScriptMorphNode.isClassExpression(unwrapExpression(value)) && effects.length > 0
        ? [ property ]
        : effects;
}

function unusedPropertyEffects(
    property: ObjectLiteralElementLike,
    resolveUnused: UnusedValueResolver,
    propertyKeyFor: ClassPropertyKeyResolver
): readonly UnusedValueEffect[] {
    if (TypeScriptMorphNode.isSpreadAssignment(property)) {
        return [ property ];
    }
    const name = property.getNameNode();
    if (TypeScriptMorphNode.isComputedPropertyName(name) && propertyKeyFor(name.getExpression()) === undefined) {
        return [ property ];
    }
    return unusedInitializerEffects(property, resolveUnused);
}

function unusedObjectEffects(
    object: ObjectLiteralExpression,
    resolveUnused: UnusedValueResolver,
    propertyKeyFor: ClassPropertyKeyResolver
): readonly UnusedValueEffect[] | undefined {
    const properties = object.getProperties();
    const effects = properties.flatMap(function (property) {
        return unusedPropertyEffects(property, resolveUnused, propertyKeyFor);
    });
    return properties.length === 1 && effects[0] === properties[0] ? undefined : effects;
}

function callCanDisappear(
    expression: Expression,
    isPure: ExpressionPurityChecker,
    canDiscard: ExpressionPurityChecker
): boolean {
    if (!TypeScriptMorphNode.isCallExpression(expression) && !TypeScriptMorphNode.isNewExpression(expression)) {
        return false;
    }
    return isPure(expression) && arePureCallArguments(expression.getArguments(), canDiscard);
}

export function createUnusedValueResolver(
    sourceFile: SourceFile,
    isPure: ExpressionPurityChecker
): UnusedValueResolver {
    const evaluation = createSourceEvaluation(sourceFile);
    const callEffects = createPureCallResolver(sourceFile);
    const propertyKeyFor: ClassPropertyKeyResolver = function (expression) {
        const value = evaluation.primitiveValue(expression);
        return value === undefined ? undefined : String(value.value);
    };
    function canDiscard(expression: Expression): boolean {
        return evaluation.canDiscard(expression) || returnCreationIsPure(expression, new Set()) ||
            callCanDisappear(unwrapExpression(expression), isPure, canDiscard);
    }
    return function resolveUnused(expression) {
        if (TypeScriptMorphNode.isClassDeclaration(expression)) {
            return hasClassImpurity(expression, canDiscard, propertyKeyFor) ? undefined : [];
        }
        if (canDiscard(expression)) {
            return [];
        }
        const node = unwrapExpression(expression);
        const sequence = unusedSequenceEffects(node, resolveUnused);
        if (sequence !== undefined) {
            return sequence;
        }
        return match(node)
            .when(TypeScriptMorphNode.isClassExpression, function (definition) {
                return hasClassImpurity(definition, canDiscard, propertyKeyFor) ? undefined : [];
            })
            .when(TypeScriptMorphNode.isObjectLiteralExpression, function (object) {
                return unusedObjectEffects(object, resolveUnused, propertyKeyFor);
            })
            .when(TypeScriptMorphNode.isNewExpression, function (construction) {
                return callEffects(construction)?.arguments ??
                    unusedConstructionEffects(construction, canDiscard, propertyKeyFor);
            })
            .when(TypeScriptMorphNode.isCallExpression, function (call) {
                return callEffects(call)?.arguments;
            })
            .otherwise(function () {
                return unusedUnaryEffects(node, resolveUnused) ?? unusedLogicalEffects(node, resolveUnused);
            });
    };
}
