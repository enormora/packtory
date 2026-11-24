import { Node as TypeScriptMorphNode, type Identifier, type Node as TypeScriptMorphNodeType } from 'ts-morph';
import { opaqueResult, type AbstractValue } from './abstract-value.ts';
import { localReadHasNoEffects } from './constant-binding.ts';
import { bindingDeclarationsOf } from './global-reference.ts';

function isRuntimeLocal(declaration: TypeScriptMorphNodeType, read: Identifier): boolean {
    const ambient = [ declaration, ...declaration.getAncestors() ].some(function (candidate) {
        return TypeScriptMorphNode.isAmbientable(candidate) && candidate.isAmbient();
    });
    return declaration.getSourceFile() === read.getSourceFile() && !ambient;
}

function enclosingActivation(node: TypeScriptMorphNodeType): TypeScriptMorphNodeType | undefined {
    return node.getFirstAncestor(TypeScriptMorphNode.isFunctionLikeDeclaration);
}

function declarationIsReadable(declaration: TypeScriptMorphNodeType, read: Identifier): boolean {
    if (TypeScriptMorphNode.isFunctionDeclaration(declaration)) {
        return true;
    }
    return (TypeScriptMorphNode.isClassDeclaration(declaration) ||
        TypeScriptMorphNode.isEnumDeclaration(declaration)) &&
        enclosingActivation(declaration) === enclosingActivation(read) && read.getStart() > declaration.getEnd();
}

export function declaredBindingValue(read: Identifier): AbstractValue | undefined {
    if (localReadHasNoEffects(read)) {
        return opaqueResult('value');
    }
    const readable = bindingDeclarationsOf(read).some(function (declaration) {
        return isRuntimeLocal(declaration, read) && declarationIsReadable(declaration, read);
    });
    return readable ? opaqueResult('value') : undefined;
}
