import { Node as TypeScriptMorphNode, SyntaxKind, type Identifier } from 'ts-morph';
import { bindingValueIsStable } from '../binding-stability.ts';
import { constantStatement } from './constant-binding.ts';
import { localFunction, type LocalFunction } from './call-target.ts';
import { functionIsSynchronous } from './callee-evaluation.ts';

function callableDefinition(declaration: TypeScriptMorphNode | undefined): LocalFunction | undefined {
    if (TypeScriptMorphNode.isVariableDeclaration(declaration)) {
        return constantStatement(declaration) === undefined ? undefined : localFunction(declaration.getInitializer());
    }
    return localFunction(declaration);
}

function callableBindingName(declaration: TypeScriptMorphNode | undefined): Identifier | undefined {
    if (
        !TypeScriptMorphNode.isVariableDeclaration(declaration) &&
        !TypeScriptMorphNode.isFunctionDeclaration(declaration)
    ) {
        return undefined;
    }
    return declaration.getNameNode()?.asKind(SyntaxKind.Identifier);
}

export function moduleCallable(declaration: TypeScriptMorphNode | undefined): LocalFunction | undefined {
    const target = callableDefinition(declaration);
    const name = callableBindingName(declaration);
    return target !== undefined && name !== undefined && functionIsSynchronous(target) && bindingValueIsStable(name)
        ? target
        : undefined;
}
