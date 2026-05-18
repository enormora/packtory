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

function classMemberIsImpure(member: TsMorphNode, settings: DeadCodeEliminationSettings | undefined): boolean {
    if (TsMorphNode.isClassStaticBlockDeclaration(member)) {
        return true;
    }
    return memberHasDecorators(member) || memberHasImpureStaticInit(member, settings);
}

export function hasClassImpurity(
    classDeclaration: ClassDeclaration,
    settings: DeadCodeEliminationSettings | undefined
): boolean {
    if (classDeclaration.getDecorators().length > 0) {
        return true;
    }
    return classDeclaration.getMembers().some((member) => {
        return classMemberIsImpure(member, settings);
    });
}
