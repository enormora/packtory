import {
    Node as TypeScriptMorphNode,
    SyntaxKind,
    type Expression,
    type Identifier,
    type FunctionDeclaration,
    type FunctionExpression,
    type ArrowFunction
} from 'ts-morph';
import { constantStatement } from '../evaluation/constant-binding.ts';
import { declarationOf } from '../evaluation/evaluation-context.ts';
import { unwrapExpression } from '../expression-unwrapping.ts';
import type { BindingDescriptor } from '../reachability/binding-extractor.ts';
import type { ModuleExportIndex } from './module-export-index.ts';
import type { ExportTargetResolver } from './module-export-resolver.ts';
import { resolveNamespaceImport } from './namespace-export-value.ts';

type ReceiverFunction = ArrowFunction | FunctionDeclaration | FunctionExpression;
export type BindingStability = (name: Identifier) => boolean;

function bindingFunction(declaration: TypeScriptMorphNode | undefined): ReceiverFunction | undefined {
    if (TypeScriptMorphNode.isFunctionDeclaration(declaration)) {
        return declaration;
    }
    if (!TypeScriptMorphNode.isVariableDeclaration(declaration) || constantStatement(declaration) === undefined) {
        return undefined;
    }
    const initializer = declaration.getInitializer();
    return TypeScriptMorphNode.isFunctionExpression(initializer) || TypeScriptMorphNode.isArrowFunction(initializer)
        ? initializer
        : undefined;
}

export function stableReceiverFunction(
    declaration: TypeScriptMorphNode | undefined,
    bindingIsStable: BindingStability
): ReceiverFunction | undefined {
    const target = bindingFunction(declaration);
    if (target === undefined) {
        return undefined;
    }
    const name = TypeScriptMorphNode.isFunctionDeclaration(target)
        ? target.getNameNode()
        : target.getFirstAncestorByKindOrThrow(SyntaxKind.VariableDeclaration).getNameNode();
    return TypeScriptMorphNode.isIdentifier(name) && bindingIsStable(name) && target.getBody() !== undefined
        ? target
        : undefined;
}

export function bindingIgnoresReceiver(
    declaration: TypeScriptMorphNode | undefined,
    bindingIsStable: BindingStability
): boolean {
    const target = stableReceiverFunction(declaration, bindingIsStable);
    return target?.getDescendantsOfKind(SyntaxKind.ThisKeyword).length === 0;
}

export function receiverBinding(
    receiver: Expression,
    name: string,
    index: ModuleExportIndex,
    resolveModule: ExportTargetResolver
): BindingDescriptor | undefined {
    const expression = unwrapExpression(receiver);
    const declaration = TypeScriptMorphNode.isIdentifier(expression) ? declarationOf(expression) : undefined;
    const namespace = resolveNamespaceImport(declaration, index.models, resolveModule);
    return index.binding(namespace, name);
}
