import {
    Node as TypeScriptMorphNode,
    SyntaxKind,
    type Expression,
    type FunctionDeclaration,
    type FunctionExpression,
    type ArrowFunction
} from 'ts-morph';
import { bindingValueIsStable } from '../binding-stability.ts';
import { constantStatement } from '../evaluation/constant-binding.ts';
import { declarationOf } from '../evaluation/evaluation-context.ts';
import { unwrapExpression } from '../expression-unwrapping.ts';
import type { BindingDescriptor } from '../reachability/binding-extractor.ts';
import type { ModuleExportIndex } from './module-export-index.ts';
import type { ExportTargetResolver } from './module-export-resolver.ts';
import { resolveNamespaceImport } from './namespace-export-value.ts';

type ReceiverFunction = ArrowFunction | FunctionDeclaration | FunctionExpression;

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

function stableReceiverFunction(declaration: TypeScriptMorphNode): ReceiverFunction | undefined {
    const target = bindingFunction(declaration);
    const name = declaration.getFirstChildByKind(SyntaxKind.Identifier);
    if (name === undefined || name.getSymbol()?.getDeclarations().length !== 1) {
        return undefined;
    }
    return bindingValueIsStable(name) ? target : undefined;
}

function receiverIsUnused(binding: BindingDescriptor): boolean {
    const target = stableReceiverFunction(binding.declarationNode);
    return target?.getBody() !== undefined && target.getDescendantsOfKind(SyntaxKind.ThisKeyword).length === 0;
}

function receiverBinding(
    receiver: Expression,
    name: string,
    index: ModuleExportIndex,
    resolveModule: ExportTargetResolver
): BindingDescriptor | undefined {
    const expression = unwrapExpression(receiver);
    const declaration = TypeScriptMorphNode.isIdentifier(expression) ? declarationOf(expression) : undefined;
    const namespace = declaration === undefined
        ? undefined
        : resolveNamespaceImport(declaration, index.models, resolveModule);
    return namespace === undefined ? undefined : index.binding(namespace, name);
}

export function createNamespaceReceiverAnalysis(
    index: ModuleExportIndex,
    resolveModule: ExportTargetResolver
): (receiver: Expression, name: string) => boolean {
    const proven = new Map<TypeScriptMorphNode, boolean>();
    return function (receiver, name) {
        const binding = receiverBinding(receiver, name, index, resolveModule);
        if (binding === undefined) {
            return false;
        }
        let unused = proven.get(binding.declarationNode);
        if (unused === undefined) {
            unused = receiverIsUnused(binding);
            proven.set(binding.declarationNode, unused);
        }
        return unused;
    };
}
