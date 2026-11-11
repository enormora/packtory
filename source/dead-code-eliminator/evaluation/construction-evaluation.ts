import { Node as TypeScriptMorphNode, type ClassExpression, type NewExpression } from 'ts-morph';
import { computedClassKey } from '../class-purity.ts';
import { primitiveResult } from './abstract-value.ts';
import { maximumEvaluationDepth, type EvaluationContext } from './evaluation-context.ts';
import { resolveLocalConstruction } from './construction-target.ts';

function evaluateMemberKey(member: TypeScriptMorphNode, context: EvaluationContext): boolean {
    const key = computedClassKey(member);
    if (key === undefined) {
        return true;
    }
    const value = primitiveResult(context.evaluate(key.expression, context));
    return value !== undefined && (!key.isStatic || String(value.value) !== 'prototype');
}

function evaluateStaticInitializer(member: TypeScriptMorphNode, context: EvaluationContext): boolean {
    if (!TypeScriptMorphNode.isPropertyDeclaration(member) || !member.isStatic()) {
        return true;
    }
    const initializer = member.getInitializer();
    return initializer === undefined || context.evaluate(initializer, context) !== undefined;
}

function evaluateDefinition(definition: ClassExpression, context: EvaluationContext): boolean {
    const members = definition.getMembers();
    if (members.some(TypeScriptMorphNode.isClassStaticBlockDeclaration)) {
        return false;
    }
    return members.every(function (member) {
        return evaluateMemberKey(member, context);
    }) && members.every(function (member) {
        return evaluateStaticInitializer(member, context);
    });
}

export function evaluateConstructionEffects(expression: NewExpression, context: EvaluationContext): boolean {
    if (context.depth >= maximumEvaluationDepth) {
        return false;
    }
    const construction = resolveLocalConstruction(expression);
    if (construction === undefined) {
        return false;
    }
    const local = { ...context, depth: context.depth + 1 };
    if (construction.definition !== undefined && !evaluateDefinition(construction.definition, local)) {
        return false;
    }
    return construction.arguments.every(function (argument) {
        return local.evaluate(argument, local) !== undefined;
    });
}
