import {
    Node as TypeScriptMorphNode,
    SyntaxKind,
    type Identifier,
    type Node as TypeScriptMorphNodeType,
    type VariableDeclaration
} from 'ts-morph';
import { expressionWithWrappers, unwrapExpression } from '../expression-unwrapping.ts';
import { bindingReferenceTargets, referenceDeclaresBinding } from '../reference-target.ts';
import { opaqueResult, type AbstractValue } from './abstract-value.ts';
import { constantDominatesRead, constantInitializer } from './constant-binding.ts';
import { globalPathOf } from './global-path.ts';
import { bindingDeclarationsOf } from './global-reference.ts';

const iterableConsumingConstructors: ReadonlySet<string> = new Set([ 'Set', 'Map', 'WeakSet', 'WeakMap' ]);

function constantArrayDeclaration(identifier: Identifier): VariableDeclaration | undefined {
    const [ declaration, ...otherDeclarations ] = bindingDeclarationsOf(identifier);
    if (!TypeScriptMorphNode.isVariableDeclaration(declaration) || otherDeclarations.length > 0) {
        return undefined;
    }
    const initializer = unwrapExpression(constantInitializer(declaration));
    return TypeScriptMorphNode.isArrayLiteralExpression(initializer) && constantDominatesRead(declaration, identifier)
        ? declaration
        : undefined;
}

function isWriteTarget(expression: TypeScriptMorphNodeType): boolean {
    const parent = expression.getParent();
    if (TypeScriptMorphNode.isBinaryExpression(parent)) {
        const operator = parent.getOperatorToken().getKind();
        return parent.getLeft() === expression &&
            operator >= SyntaxKind.FirstAssignment && operator <= SyntaxKind.LastAssignment;
    }
    return TypeScriptMorphNode.isPrefixUnaryExpression(parent) ||
        TypeScriptMorphNode.isPostfixUnaryExpression(parent) ||
        TypeScriptMorphNode.isDeleteExpression(parent);
}

function readsProperty(reference: TypeScriptMorphNodeType, parent: TypeScriptMorphNodeType | undefined): boolean {
    return (TypeScriptMorphNode.isPropertyAccessExpression(parent) ||
        TypeScriptMorphNode.isElementAccessExpression(parent)) &&
        parent.getExpression() === reference && !isWriteTarget(expressionWithWrappers(parent));
}

function iterates(reference: TypeScriptMorphNodeType, parent: TypeScriptMorphNodeType | undefined): boolean {
    return TypeScriptMorphNode.isSpreadElement(parent) ||
        TypeScriptMorphNode.isForOfStatement(parent) && parent.getExpression() === reference;
}

function passesToIterableConstructor(
    reference: TypeScriptMorphNodeType,
    parent: TypeScriptMorphNodeType | undefined
): boolean {
    if (!TypeScriptMorphNode.isNewExpression(parent) || !parent.getArguments().includes(reference)) {
        return false;
    }
    const path = globalPathOf(parent.getExpression(), function unknownKey() {
        return undefined;
    });
    return path?.length === 1 && iterableConsumingConstructors.has(path.join('.'));
}

function referenceKeepsArrayIterable(reference: TypeScriptMorphNodeType): boolean {
    if (referenceDeclaresBinding(reference) || !TypeScriptMorphNode.isExpression(reference)) {
        return referenceDeclaresBinding(reference);
    }
    const outer = expressionWithWrappers(reference);
    const parent = outer.getParent();
    return iterates(outer, parent) || readsProperty(outer, parent) || passesToIterableConstructor(outer, parent);
}

export function iterableArrayBindingValue(identifier: Identifier): AbstractValue | undefined {
    const declaration = constantArrayDeclaration(identifier);
    if (declaration === undefined) {
        return undefined;
    }
    const name = declaration.getNameNode().asKindOrThrow(SyntaxKind.Identifier);
    return bindingReferenceTargets(name).every(referenceKeepsArrayIterable) ? opaqueResult('array') : undefined;
}
