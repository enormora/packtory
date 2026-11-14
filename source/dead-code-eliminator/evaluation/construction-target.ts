import {
    Node as TypeScriptMorphNode,
    ts,
    type ClassDeclaration,
    type ClassExpression,
    type Expression,
    type Identifier,
    type NewExpression
} from 'ts-morph';
import { classConstructionIsPure } from '../class-purity.ts';
import { bindingValueIsStable } from '../binding-stability.ts';
import { hasDynamicScope } from '../dynamic-scope.ts';
import { unwrapExpression } from '../expression-unwrapping.ts';
import { collectBindingDependencies } from '../exports/binding-dependencies.ts';
import { constantDominatesRead } from './constant-binding.ts';
import { declarationOf } from './evaluation-context.ts';
import { createCallTargetResolver } from './call-target.ts';
import { functionConstructionIsPure } from './empty-constructor.ts';

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

function constructorBindingTarget(read: Identifier): ConstructionClass | Expression | undefined {
    const declaration = declarationOf(read);
    if (TypeScriptMorphNode.isClassDeclaration(declaration)) {
        return declaredClassTarget(declaration, read);
    }
    return TypeScriptMorphNode.isVariableDeclaration(declaration) && constantDominatesRead(declaration, read)
        ? declaration.getInitializer()
        : undefined;
}

function constructorStep(expression: Expression): ConstructionClass | Expression {
    const read = unwrapExpression(expression);
    if (TypeScriptMorphNode.isClassExpression(read)) {
        return read;
    }
    return TypeScriptMorphNode.isIdentifier(read) ? constructorBindingTarget(read) ?? expression : expression;
}

function isConstructionClass(node: ConstructionClass | Expression): node is ConstructionClass {
    return TypeScriptMorphNode.isClassDeclaration(node) || TypeScriptMorphNode.isClassExpression(node);
}

function constructionClass(expression: Expression): ConstructionClass | undefined {
    const leaves = collectBindingDependencies<ConstructionClass | Expression>(expression, {
        get(target) {
            if (isConstructionClass(target)) {
                return undefined;
            }
            return function () {
                return [ constructorStep(target) ];
            };
        }
    });
    return leaves.find(isConstructionClass);
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

function resolveClassConstruction(
    expression: NewExpression,
    argumentsToEvaluate: readonly Expression[]
): LocalConstruction | undefined {
    const constructorValue = unwrapExpression(expression.getExpression());
    const target = constructionClass(constructorValue);
    if (target === undefined || !classConstructionIsPure(target)) {
        return undefined;
    }
    return {
        definition: TypeScriptMorphNode.isClassExpression(constructorValue) ? constructorValue : undefined,
        arguments: argumentsToEvaluate
    };
}

export function resolveLocalConstruction(expression: NewExpression): LocalConstruction | undefined {
    const argumentsToEvaluate = constructionArguments(expression);
    if (argumentsToEvaluate === undefined || hasDynamicScope(expression.getSourceFile())) {
        return undefined;
    }
    const functionTarget = createCallTargetResolver(expression.getSourceFile(), functionConstructionIsPure)(expression);
    return functionTarget === undefined
        ? resolveClassConstruction(expression, argumentsToEvaluate)
        : { definition: undefined, arguments: argumentsToEvaluate };
}
