import { Node as TypeScriptMorphNode, VariableDeclarationKind, type VariableDeclaration } from 'ts-morph';
import type { LocalFunction } from './call-target.ts';
import { createBindingReference, declarationOf, type EvaluationContext } from './evaluation-context.ts';
import { evaluated } from './primitive-value.ts';

function hoistedDeclarations(target: LocalFunction): readonly VariableDeclaration[] {
    const declarations: VariableDeclaration[] = [];
    target.getBody()?.forEachDescendant(function (node, traversal) {
        if (
            TypeScriptMorphNode.isFunctionLikeDeclaration(node) || TypeScriptMorphNode.isClassLikeDeclarationBase(node)
        ) {
            traversal.skip();
        } else if (
            TypeScriptMorphNode.isVariableDeclarationList(node) &&
            node.getDeclarationKind() === VariableDeclarationKind.Var
        ) {
            declarations.push(...node.getDeclarations());
        }
    });
    return declarations;
}

export function initializeHoistedLocals(target: LocalFunction, context: EvaluationContext): boolean {
    return hoistedDeclarations(target).every(function (declaration) {
        const name = declaration.getNameNode();
        if (
            !TypeScriptMorphNode.isIdentifier(name) || name.getText() === 'arguments' ||
            declarationOf(name) !== declaration
        ) {
            return false;
        }
        context.locals.set(declaration, createBindingReference(evaluated(undefined), true));
        return true;
    });
}
