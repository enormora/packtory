import { Node as TypeScriptMorphNode, type ClassDeclaration, type ClassExpression, type Expression } from 'ts-morph';
import type { ExpressionPurityChecker } from './imported-expression-origin.ts';
import { unwrapExpression } from './expression-unwrapping.ts';

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

function memberHasImpureComputedName(
    member: TypeScriptMorphNode,
    isPure: ExpressionPurityChecker
): boolean {
    if (
        !TypeScriptMorphNode.isMethodDeclaration(member) &&
        !TypeScriptMorphNode.isPropertyDeclaration(member) &&
        !TypeScriptMorphNode.isGetAccessorDeclaration(member) &&
        !TypeScriptMorphNode.isSetAccessorDeclaration(member)
    ) {
        return false;
    }
    const name = member.getNameNode();
    return TypeScriptMorphNode.isComputedPropertyName(name) && !isPure(name.getExpression());
}

function classMemberIsImpure(member: TypeScriptMorphNode, isPure: ExpressionPurityChecker): boolean {
    if (TypeScriptMorphNode.isClassStaticBlockDeclaration(member)) {
        return true;
    }
    return memberHasDecorators(member) ||
        memberHasImpureComputedName(member, isPure) ||
        memberHasImpureStaticInitialization(member, isPure);
}

export function hasClassImpurity(
    classDeclaration: ClassDeclaration | ClassExpression,
    isPure: ExpressionPurityChecker
): boolean {
    if (classDeclaration.getDecorators().length > 0) {
        return true;
    }
    const extendsExpression = classDeclaration.getExtends()?.getExpression();
    if (extendsExpression !== undefined && !classHeritageIsPure(extendsExpression, isPure)) {
        return true;
    }
    return classDeclaration.getMembers().some(function (member) {
        return classMemberIsImpure(member, isPure);
    });
}
