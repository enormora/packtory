import { Node as TypeScriptMorphNode, type ClassDeclaration, type ClassExpression, type Expression } from 'ts-morph';
import type { ExpressionPurityChecker } from './imported-expression-origin.ts';
import { unwrapExpression } from './expression-unwrapping.ts';
import { constructorBodyIsEmpty } from './evaluation/empty-constructor.ts';

export type ClassPropertyKeyResolver = (expression: Expression) => string | undefined;
type ComputedClassKey = { readonly expression: Expression; readonly isStatic: boolean; };

function classHeritageIsPure(expression: Expression, isPure: ExpressionPurityChecker): boolean {
    const heritage = unwrapExpression(expression);
    if (TypeScriptMorphNode.isNullLiteral(heritage)) {
        return true;
    }
    if (TypeScriptMorphNode.isFunctionExpression(heritage)) {
        return !heritage.isAsync() && !heritage.isGenerator();
    }
    return TypeScriptMorphNode.isClassExpression(heritage) && isPure(heritage);
}

function memberHasDecorators(member: TypeScriptMorphNode): boolean {
    if (
        TypeScriptMorphNode.isMethodDeclaration(member) ||
        TypeScriptMorphNode.isPropertyDeclaration(member) ||
        TypeScriptMorphNode.isGetAccessorDeclaration(member) ||
        TypeScriptMorphNode.isSetAccessorDeclaration(member)
    ) {
        return member.getDecorators().length > 0;
    }
    return false;
}

function memberHasImpureStaticInitialization(
    member: TypeScriptMorphNode,
    isPure: ExpressionPurityChecker
): boolean {
    if (!TypeScriptMorphNode.isPropertyDeclaration(member) || !member.isStatic()) {
        return false;
    }
    const initializer = member.getInitializer();
    return initializer !== undefined && !isPure(initializer);
}

export function computedClassKey(member: TypeScriptMorphNode): ComputedClassKey | undefined {
    if (
        !TypeScriptMorphNode.isMethodDeclaration(member) &&
        !TypeScriptMorphNode.isPropertyDeclaration(member) &&
        !TypeScriptMorphNode.isGetAccessorDeclaration(member) &&
        !TypeScriptMorphNode.isSetAccessorDeclaration(member)
    ) {
        return undefined;
    }
    const name = member.getNameNode();
    return TypeScriptMorphNode.isComputedPropertyName(name)
        ? { expression: name.getExpression(), isStatic: member.isStatic() }
        : undefined;
}

function computedClassKeyIsImpure(
    expression: Expression,
    isStatic: boolean,
    propertyKeyFor: ClassPropertyKeyResolver
): boolean {
    const key = propertyKeyFor(expression);
    return key === undefined || isStatic && key === 'prototype';
}

function memberHasImpureComputedName(member: TypeScriptMorphNode, propertyKeyFor: ClassPropertyKeyResolver): boolean {
    const key = computedClassKey(member);
    return key !== undefined && computedClassKeyIsImpure(key.expression, key.isStatic, propertyKeyFor);
}

function classMemberIsImpure(
    member: TypeScriptMorphNode,
    isPure: ExpressionPurityChecker,
    propertyKeyFor: ClassPropertyKeyResolver
): boolean {
    if (TypeScriptMorphNode.isClassStaticBlockDeclaration(member)) {
        return true;
    }
    return memberHasDecorators(member) ||
        memberHasImpureComputedName(member, propertyKeyFor) ||
        memberHasImpureStaticInitialization(member, isPure);
}

export function hasClassImpurity(
    classDeclaration: ClassDeclaration | ClassExpression,
    isPure: ExpressionPurityChecker,
    propertyKeyFor: ClassPropertyKeyResolver
): boolean {
    if (classDeclaration.getDecorators().length > 0) {
        return true;
    }
    const extendsExpression = classDeclaration.getExtends()?.getExpression();
    if (extendsExpression !== undefined && !classHeritageIsPure(extendsExpression, isPure)) {
        return true;
    }
    return classDeclaration.getMembers().some(function (member) {
        return classMemberIsImpure(member, isPure, propertyKeyFor);
    });
}

export function classConstructionIsPure(target: ClassDeclaration | ClassExpression): boolean {
    if (
        target.getExtends() !== undefined || !target.getConstructors().every(constructorBodyIsEmpty) ||
        target.getDecorators().length > 0
    ) {
        return false;
    }
    return target.getMembers().every(function (member) {
        return !(memberHasDecorators(member) ||
            TypeScriptMorphNode.isPropertyDeclaration(member) && !member.isStatic());
    });
}
