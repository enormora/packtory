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

function bindingFunction(declaration: TypeScriptMorphNode): ReceiverFunction | undefined {
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

function receiverIsUnused(binding: BindingDescriptor, bindingIsStable: BindingStability): boolean {
    const declaration = binding.declarationNode;
    const target = bindingFunction(declaration);
    if (target === undefined) {
        return false;
    }
    const name = TypeScriptMorphNode.isFunctionDeclaration(target)
        ? target.getNameNode()
        : declaration.getFirstChildByKindOrThrow(SyntaxKind.Identifier);
    return name !== undefined && bindingIsStable(name) && target.getBody() !== undefined &&
        target.getDescendantsOfKind(SyntaxKind.ThisKeyword).length === 0;
}

function receiverBinding(
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

export function createNamespaceReceiverAnalysis(
    index: ModuleExportIndex,
    resolveModule: ExportTargetResolver,
    bindingIsStable: BindingStability
): (receiver: Expression, name: string) => boolean {
    const proven = new Map<TypeScriptMorphNode, boolean>();
    return function (receiver, name) {
        const binding = receiverBinding(receiver, name, index, resolveModule);
        if (binding === undefined) {
            return false;
        }
        let unused = proven.get(binding.declarationNode);
        if (unused === undefined) {
            unused = receiverIsUnused(binding, bindingIsStable);
            proven.set(binding.declarationNode, unused);
        }
        return unused;
    };
}
