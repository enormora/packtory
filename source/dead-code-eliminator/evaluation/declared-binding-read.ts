import { Node as TypeScriptMorphNode, type Identifier, type Node as TypeScriptMorphNodeType } from 'ts-morph';
import { opaqueResult, type AbstractValue } from './abstract-value.ts';
import { localReadHasNoEffects } from './constant-binding.ts';
import { bindingDeclarationsOf } from './global-reference.ts';
import { importedBindingValue } from './imported-value.ts';

function isRuntimeLocal(declaration: TypeScriptMorphNodeType, read: Identifier): boolean {
    const ambient = [ declaration, ...declaration.getAncestors() ].some(function (candidate) {
        return TypeScriptMorphNode.isAmbientable(candidate) && candidate.isAmbient();
    });
    return declaration.getSourceFile() === read.getSourceFile() && !ambient;
}

function enclosingActivation(node: TypeScriptMorphNodeType): TypeScriptMorphNodeType | undefined {
    return node.getFirstAncestor(TypeScriptMorphNode.isFunctionLikeDeclaration);
}

function initializedScopeOf(declaration: TypeScriptMorphNodeType): TypeScriptMorphNodeType | undefined {
    const parent = declaration.getParentOrThrow();
    if (TypeScriptMorphNode.isCatchClause(parent)) {
        return parent.getBlock();
    }
    const owner = parent.getParent();
    const isLoop = TypeScriptMorphNode.isForOfStatement(owner) || TypeScriptMorphNode.isForInStatement(owner) ||
        TypeScriptMorphNode.isForStatement(owner);
    return isLoop ? owner.getStatement() : undefined;
}

function loopOrCatchBindingIsInitialized(declaration: TypeScriptMorphNodeType, read: Identifier): boolean {
    return initializedScopeOf(declaration)?.containsRange(read.getStart(), read.getEnd()) === true;
}

function declarationIsReadable(declaration: TypeScriptMorphNodeType, read: Identifier): boolean {
    if (loopOrCatchBindingIsInitialized(declaration, read) || TypeScriptMorphNode.isFunctionDeclaration(declaration)) {
        return true;
    }
    return (TypeScriptMorphNode.isClassDeclaration(declaration) ||
        TypeScriptMorphNode.isEnumDeclaration(declaration)) &&
        enclosingActivation(declaration) === enclosingActivation(read) && read.getPos() >= declaration.getEnd();
}

export function declaredBindingValue(read: Identifier): AbstractValue | undefined {
    if (localReadHasNoEffects(read)) {
        return opaqueResult('value');
    }
    const imported = enclosingActivation(read) === undefined ? importedBindingValue(read) : undefined;
    if (imported !== undefined) {
        return imported;
    }
    const readable = bindingDeclarationsOf(read).some(function (declaration) {
        return isRuntimeLocal(declaration, read) && declarationIsReadable(declaration, read);
    });
    return readable ? opaqueResult('value') : undefined;
}
