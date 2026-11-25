import { constant } from 'remeda';
import {
    Node as TypeScriptMorphNode,
    SyntaxKind,
    type Expression,
    type Identifier,
    type Node as TypeScriptMorphNodeType,
    type VariableDeclaration
} from 'ts-morph';
import { expressionWithWrappers, unwrapExpression } from '../expression-unwrapping.ts';
import { bindingReferenceTargets, referenceAliasName, referenceDeclaresBinding } from '../reference-target.ts';
import { expressionIsWriteTarget } from '../transform/expression-write.ts';
import { opaqueResult, type AbstractValue } from './abstract-value.ts';
import { constantDominatesRead, constantInitializer } from './constant-binding.ts';
import { globalPathOf } from './global-path.ts';
import { importedCallIsPure } from './imported-value.ts';
import { bindingDeclarationsOf } from './global-reference.ts';

type ShapeKeepingUse = (reference: TypeScriptMorphNodeType, parent: TypeScriptMorphNodeType | undefined) => boolean;

const iterableConsumingConstructors: ReadonlySet<string> = new Set([ 'Set', 'Map', 'WeakSet', 'WeakMap' ]);

function constantArrayDeclaration(identifier: Identifier): VariableDeclaration | undefined {
    const [ declaration ] = bindingDeclarationsOf(identifier);
    if (!TypeScriptMorphNode.isVariableDeclaration(declaration)) {
        return undefined;
    }
    const initializer = unwrapExpression(constantInitializer(declaration));
    return TypeScriptMorphNode.isArrayLiteralExpression(initializer) && constantDominatesRead(declaration, identifier)
        ? declaration
        : undefined;
}

function memberIsWritten(member: Expression): boolean {
    return expressionIsWriteTarget(member) ||
        TypeScriptMorphNode.isDeleteExpression(expressionWithWrappers(member).getParent());
}

function memberRead(
    reference: TypeScriptMorphNodeType,
    parent: TypeScriptMorphNodeType | undefined
): Expression | undefined {
    const isMember = TypeScriptMorphNode.isPropertyAccessExpression(parent) ||
        TypeScriptMorphNode.isElementAccessExpression(parent);
    return isMember && parent.getExpression() === reference && !memberIsWritten(parent) ? parent : undefined;
}

function readsProperty(reference: TypeScriptMorphNodeType, parent: TypeScriptMorphNodeType | undefined): boolean {
    return memberRead(reference, parent) !== undefined;
}

function readsUncalledProperty(
    reference: TypeScriptMorphNodeType,
    parent: TypeScriptMorphNodeType | undefined
): boolean {
    const member = memberRead(reference, parent);
    if (member === undefined) {
        return false;
    }
    const outer = expressionWithWrappers(member);
    const caller = outer.getParent();
    return !TypeScriptMorphNode.isCallExpression(caller) || caller.getExpression() !== outer;
}

function iterates(parent: TypeScriptMorphNodeType | undefined): boolean {
    return TypeScriptMorphNode.isSpreadElement(parent) || TypeScriptMorphNode.isForOfStatement(parent);
}

function passesToIterableConstructor(
    reference: TypeScriptMorphNodeType,
    parent: TypeScriptMorphNodeType | undefined
): boolean {
    if (!TypeScriptMorphNode.isNewExpression(parent) || !parent.getArguments().includes(reference)) {
        return false;
    }
    const path = globalPathOf(parent.getExpression(), constant(undefined));
    return path !== undefined && iterableConsumingConstructors.has(path.join('.'));
}

function referenceKeepsShape(
    reference: TypeScriptMorphNodeType,
    keepsShape: ShapeKeepingUse,
    followAlias: (alias: Identifier) => boolean
): boolean {
    if (referenceDeclaresBinding(reference)) {
        return true;
    }
    const alias = referenceAliasName(reference);
    if (alias !== undefined) {
        return followAlias(alias);
    }
    const outer = expressionWithWrappers(reference);
    return keepsShape(outer, outer.getParent());
}

function passesToPureCall(parent: TypeScriptMorphNodeType | undefined): boolean {
    return TypeScriptMorphNode.isCallExpression(parent) && importedCallIsPure(parent);
}

function constantKeepsShape(declaration: VariableDeclaration, keepsShape: ShapeKeepingUse): boolean {
    const pending = new Set(bindingReferenceTargets(declaration.getNameNode().asKindOrThrow(SyntaxKind.Identifier)));
    function followAlias(alias: Identifier): boolean {
        for (const reference of bindingReferenceTargets(alias)) {
            pending.add(reference);
        }
        return true;
    }
    for (const reference of pending) {
        if (!referenceKeepsShape(reference, keepsShape, followAlias)) {
            return false;
        }
    }
    return true;
}

export function constantArrayStaysIterable(declaration: VariableDeclaration): boolean {
    return constantKeepsShape(declaration, function (reference, parent) {
        return iterates(parent) || readsProperty(reference, parent) || passesToIterableConstructor(reference, parent) ||
            passesToPureCall(parent);
    });
}

export function constantObjectStaysSpreadSafe(declaration: VariableDeclaration): boolean {
    return constantKeepsShape(declaration, function (reference, parent) {
        return TypeScriptMorphNode.isSpreadAssignment(parent) || readsUncalledProperty(reference, parent) ||
            passesToPureCall(parent);
    });
}

export function iterableArrayBindingValue(identifier: Identifier): AbstractValue | undefined {
    const declaration = constantArrayDeclaration(identifier);
    return declaration !== undefined && constantArrayStaysIterable(declaration) ? opaqueResult('array') : undefined;
}
