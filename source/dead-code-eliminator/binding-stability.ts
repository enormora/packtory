import {
    Node as TypeScriptMorphNode,
    type Expression,
    type Identifier,
    type ReferenceEntry,
    type Node as TypeScriptMorphNodeType
} from 'ts-morph';
import { unwrapExpression } from './expression-unwrapping.ts';
import { hasDynamicScope } from './dynamic-scope.ts';
import { builderCallIsPure, type BuilderFunction } from './liveness/builder-return.ts';
import {
    referenceAliasName,
    referenceDeclaresBinding,
    referenceMayUseBinding,
    referenceTarget,
    bindingReferenceTargets
} from './reference-target.ts';

type ReferenceObserver = (reference: TypeScriptMorphNodeType) => boolean;
type RuntimeCallProof = (expression: Expression) => boolean;

function referenceIsModuleBinding(reference: TypeScriptMorphNodeType): boolean {
    const parent = reference.getParent();
    return TypeScriptMorphNode.isImportSpecifier(parent) || TypeScriptMorphNode.isExportSpecifier(parent) ||
        TypeScriptMorphNode.isImportClause(parent);
}

function referencePreservesBinding(reference: ReferenceEntry, name: Identifier): boolean {
    if (!reference.isWriteAccess()) {
        return true;
    }
    const node = referenceTarget(reference);
    return node === name || referenceDeclaresBinding(node) || referenceIsModuleBinding(node);
}

export function bindingValueIsStable(name: Identifier): boolean {
    return !hasDynamicScope(name.getSourceFile()) && name
        .findReferences()
        .flatMap(function (group) {
            return group.getReferences();
        })
        .every(function (reference) {
            return referencePreservesBinding(reference, name);
        });
}

function bindingReferencesOnlyObserveValue(name: Identifier, observe: ReferenceObserver): boolean {
    return bindingReferenceTargets(name).every(observe);
}

export function bindingHasOnlyUses(
    name: TypeScriptMorphNodeType,
    declaration: TypeScriptMorphNodeType,
    allowed: ReadonlySet<TypeScriptMorphNodeType>
): boolean {
    if (!TypeScriptMorphNode.isIdentifier(name)) {
        return false;
    }
    const symbol = name.getSymbol();
    if (symbol === undefined) {
        return false;
    }
    const [ first, additional ] = symbol.getDeclarations();
    return first === declaration && additional === undefined &&
        bindingReferencesOnlyObserveValue(name, function (reference) {
            return reference === name || allowed.has(reference) || !referenceMayUseBinding(reference, declaration);
        });
}

function sourceMemberFunction(declaration: TypeScriptMorphNodeType): BuilderFunction | undefined {
    if (
        TypeScriptMorphNode.isMethodDeclaration(declaration) || TypeScriptMorphNode.isFunctionDeclaration(declaration)
    ) {
        return declaration;
    }
    const initializer = TypeScriptMorphNode.isPropertyAssignment(declaration)
        ? declaration.getInitializer()
        : undefined;
    return TypeScriptMorphNode.isArrowFunction(initializer) || TypeScriptMorphNode.isFunctionExpression(initializer)
        ? initializer
        : undefined;
}

function sourceMemberCallIsPure(declaration: TypeScriptMorphNodeType): boolean {
    if (declaration.getSourceFile().isDeclarationFile()) {
        return false;
    }
    const target = sourceMemberFunction(declaration);
    return target?.getBody() !== undefined && builderCallIsPure(target);
}

function calledMemberIsPure(reference: TypeScriptMorphNodeType, proveRuntimeCall: RuntimeCallProof): boolean {
    if (!TypeScriptMorphNode.isPropertyAccessExpression(reference) || proveRuntimeCall(reference)) {
        return true;
    }
    const symbol = reference.getSymbol();
    if (symbol === undefined) {
        return false;
    }
    const [ declaration, additional ] = symbol.getDeclarations();
    return declaration !== undefined && additional === undefined && sourceMemberCallIsPure(declaration);
}

function referenceCreatesAlias(reference: TypeScriptMorphNodeType, observe: ReferenceObserver): boolean {
    const name = referenceAliasName(reference);
    return name !== undefined && bindingReferencesOnlyObserveValue(name, observe);
}

function referenceContinuesObservation(reference: TypeScriptMorphNodeType, observe: ReferenceObserver): boolean {
    const parent = reference.getParent();
    if (TypeScriptMorphNode.isPropertyAccessExpression(parent)) {
        return observe(parent);
    }
    if (TypeScriptMorphNode.isParenthesizedExpression(parent) || TypeScriptMorphNode.isSpreadAssignment(parent)) {
        return observe(parent);
    }
    return TypeScriptMorphNode.isObjectLiteralExpression(parent) && observe(parent);
}

function referenceCallsValue(reference: TypeScriptMorphNodeType, proveRuntimeCall: RuntimeCallProof): boolean {
    const parent = reference.getParent();
    return TypeScriptMorphNode.isCallExpression(parent) && parent.getExpression() === reference &&
        calledMemberIsPure(reference, proveRuntimeCall);
}

export function bindingShapeIsStable(name: Identifier, proveRuntimeCall: RuntimeCallProof): boolean {
    const seen = new Set<TypeScriptMorphNodeType>();
    const observe: ReferenceObserver = function (reference) {
        if (seen.has(reference)) {
            return true;
        }
        seen.add(reference);
        return referenceDeclaresBinding(reference) || referenceIsModuleBinding(reference) ||
            referenceCreatesAlias(reference, observe) || referenceContinuesObservation(reference, observe) ||
            referenceCallsValue(reference, proveRuntimeCall);
    };
    return !hasDynamicScope(name.getSourceFile()) && bindingReferencesOnlyObserveValue(name, observe);
}

export function expressionBindingShapeIsStable(expression: Expression, proveRuntimeCall: RuntimeCallProof): boolean {
    const node = unwrapExpression(expression);
    if (TypeScriptMorphNode.isIdentifier(node)) {
        return bindingShapeIsStable(node, proveRuntimeCall);
    }
    if (TypeScriptMorphNode.isPropertyAccessExpression(node) || TypeScriptMorphNode.isCallExpression(node)) {
        return expressionBindingShapeIsStable(node.getExpression(), proveRuntimeCall);
    }
    return false;
}
