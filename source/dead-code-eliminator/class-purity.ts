import { Node as TsMorphNode, type ClassDeclaration } from 'ts-morph';
import type { DeadCodeEliminationSettings } from '../config/dead-code-elimination-settings.ts';
import { isPureExpression } from './pure-expression.ts';

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

function memberHasImpureComputedName(member: TsMorphNode, settings: DeadCodeEliminationSettings | undefined): boolean {
    if (
        TsMorphNode.isMethodDeclaration(member) ||
        TsMorphNode.isPropertyDeclaration(member) ||
        TsMorphNode.isGetAccessorDeclaration(member) ||
        TsMorphNode.isSetAccessorDeclaration(member)
    ) {
        const name = member.getNameNode();
        return TsMorphNode.isComputedPropertyName(name) && !isPureExpression(name.getExpression(), settings);
    }

    return false;
}

function classMemberIsImpure(member: TsMorphNode, settings: DeadCodeEliminationSettings | undefined): boolean {
    if (TsMorphNode.isClassStaticBlockDeclaration(member)) {
        return true;
    }
    return memberHasDecorators(member) ||
        memberHasImpureComputedName(member, settings) ||
        memberHasImpureStaticInit(member, settings);
}

function classHeritageIsImpure(
    classDeclaration: ClassDeclaration,
    settings: DeadCodeEliminationSettings | undefined
): boolean {
    const extendsExpression = classDeclaration.getExtends()?.getExpression();
    return extendsExpression !== undefined && !isPureExpression(extendsExpression, settings);
}

export function hasClassImpurity(
    classDeclaration: ClassDeclaration,
    settings: DeadCodeEliminationSettings | undefined
): boolean {
    if (classDeclaration.getDecorators().length > 0) {
        return true;
    }
    if (classHeritageIsImpure(classDeclaration, settings)) {
        return true;
    }
    return classDeclaration.getMembers().some(function (member) {
        return classMemberIsImpure(member, settings);
    });
}
