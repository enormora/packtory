import { Node as TypeScriptMorphNode, type ClassDeclaration } from 'ts-morph';
import type { DeadCodeEliminationSettings } from '../configuration/dead-code-elimination-settings.ts';
import { isPureExpression } from './pure-expression.ts';

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
    settings: DeadCodeEliminationSettings | undefined
): boolean {
    if (!TypeScriptMorphNode.isPropertyDeclaration(member) || !member.isStatic()) {
        return false;
    }
    const initializer = member.getInitializer();
    return initializer !== undefined && !isPureExpression(initializer, settings);
}

function memberHasImpureComputedName(
    member: TypeScriptMorphNode,
    settings: DeadCodeEliminationSettings | undefined
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
    return TypeScriptMorphNode.isComputedPropertyName(name) && !isPureExpression(name.getExpression(), settings);
}

function classMemberIsImpure(member: TypeScriptMorphNode, settings: DeadCodeEliminationSettings | undefined): boolean {
    if (TypeScriptMorphNode.isClassStaticBlockDeclaration(member)) {
        return true;
    }
    return memberHasDecorators(member) ||
        memberHasImpureComputedName(member, settings) ||
        memberHasImpureStaticInitialization(member, settings);
}

export function hasClassImpurity(
    classDeclaration: ClassDeclaration,
    settings: DeadCodeEliminationSettings | undefined
): boolean {
    if (classDeclaration.getDecorators().length > 0) {
        return true;
    }
    const extendsExpression = classDeclaration.getExtends()?.getExpression();
    if (extendsExpression !== undefined && !isPureExpression(extendsExpression, settings)) {
        return true;
    }
    return classDeclaration.getMembers().some(function (member) {
        return classMemberIsImpure(member, settings);
    });
}
