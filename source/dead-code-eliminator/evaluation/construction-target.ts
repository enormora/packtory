import {
    Node as TypeScriptMorphNode,
    ts,
    type ClassDeclaration,
    type ClassExpression,
    type Expression,
    type Identifier,
    type NewExpression
} from 'ts-morph';
import { defaultClassConstructionIsPure } from '../class-purity.ts';
import { bindingValueIsStable } from '../binding-stability.ts';
import { hasDynamicScope } from '../dynamic-scope.ts';
import { unwrapExpression } from '../expression-unwrapping.ts';
import { constantDominatesRead } from './constant-binding.ts';
import { declarationOf } from './evaluation-context.ts';

export type LocalConstruction = {
    readonly definition: ClassExpression | undefined;
    readonly arguments: readonly Expression[];
};

type ConstructionClass = ClassDeclaration | ClassExpression;

function classBindingIsPrivate(declaration: ClassDeclaration): boolean {
    return declaration.getFirstAncestor(TypeScriptMorphNode.isFunctionLikeDeclaration) !== undefined ||
        ts.isExternalModule(declaration.getSourceFile().compilerNode) ||
        /\.[cm][jt]s$/u.test(declaration.getSourceFile().getFilePath());
}

function classDeclarationDominatesRead(declaration: ClassDeclaration, read: Identifier): boolean {
    const activation = declaration.getFirstAncestor(TypeScriptMorphNode.isFunctionLikeDeclaration);
    const scope = declaration.getParentOrThrow();
    return activation === read.getFirstAncestor(TypeScriptMorphNode.isFunctionLikeDeclaration) &&
        read.getAncestors().some(function (ancestor) {
            return ancestor.getParent() === scope && declaration.getChildIndex() < ancestor.getChildIndex();
        });
}

function declaredClassTarget(declaration: ClassDeclaration, read: Identifier): ClassDeclaration | undefined {
    if (
        declaration.isAmbient() || !classBindingIsPrivate(declaration) ||
        !classDeclarationDominatesRead(declaration, read)
    ) {
        return undefined;
    }
    return bindingValueIsStable(declaration.getNameNodeOrThrow()) ? declaration : undefined;
}

function constructorStep(expression: Expression): ConstructionClass | Expression | undefined {
    const read = unwrapExpression(expression);
    if (TypeScriptMorphNode.isClassExpression(read)) {
        return read;
    }
    if (!TypeScriptMorphNode.isIdentifier(read)) {
        return undefined;
    }
    const declaration = declarationOf(read);
    if (TypeScriptMorphNode.isClassDeclaration(declaration)) {
        return declaredClassTarget(declaration, read);
    }
    return TypeScriptMorphNode.isVariableDeclaration(declaration) && constantDominatesRead(declaration, read)
        ? declaration.getInitializer()
        : undefined;
}

function constructionClass(expression: Expression): ConstructionClass | undefined {
    let target: ConstructionClass | Expression | undefined = expression;
    while (target !== undefined) {
        if (TypeScriptMorphNode.isClassDeclaration(target) || TypeScriptMorphNode.isClassExpression(target)) {
            return target;
        }
        target = constructorStep(target);
    }
    return undefined;
}

function constructionArguments(expression: NewExpression): readonly Expression[] | undefined {
    const argumentsToEvaluate = expression.getArguments();
    if (
        argumentsToEvaluate.some(TypeScriptMorphNode.isSpreadElement) ||
        !argumentsToEvaluate.every(TypeScriptMorphNode.isExpression)
    ) {
        return undefined;
    }
    return argumentsToEvaluate;
}

export function resolveLocalConstruction(expression: NewExpression): LocalConstruction | undefined {
    const argumentsToEvaluate = constructionArguments(expression);
    if (argumentsToEvaluate === undefined || hasDynamicScope(expression.getSourceFile())) {
        return undefined;
    }
    const constructorValue = unwrapExpression(expression.getExpression());
    const target = constructionClass(constructorValue);
    if (target === undefined || !defaultClassConstructionIsPure(target)) {
        return undefined;
    }
    return {
        definition: TypeScriptMorphNode.isClassExpression(constructorValue) ? constructorValue : undefined,
        arguments: argumentsToEvaluate
    };
}
