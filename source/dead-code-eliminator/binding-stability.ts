import {
    Node as TypeScriptMorphNode,
    SyntaxKind,
    type Expression,
    type Identifier,
    type Symbol as TypeScriptMorphSymbol,
    type ReferenceEntry,
    type Node as TypeScriptMorphNodeType
} from 'ts-morph';
import { unwrapExpression } from './expression-unwrapping.ts';
import { hasDynamicScope } from './dynamic-scope.ts';
import { builderCallIsPure, type BuilderFunction } from './liveness/builder-return.ts';
import { referenceTarget } from './reference-target.ts';

type ReferenceObserver = (reference: TypeScriptMorphNodeType) => boolean;
type RuntimeCallProof = (expression: Expression) => boolean;

function isBindingDeclaration(node: TypeScriptMorphNodeType | undefined): boolean {
    return TypeScriptMorphNode.isVariableDeclaration(node) || TypeScriptMorphNode.isFunctionDeclaration(node) ||
        TypeScriptMorphNode.isNamespaceImport(node);
}

function referenceDeclaresBinding(reference: TypeScriptMorphNodeType): boolean {
    const parent = reference.getParent();
    return isBindingDeclaration(parent) &&
        parent?.getFirstChildByKind(SyntaxKind.Identifier)?.getStart() === reference.getStart();
}

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
    return node !== undefined &&
        (node === name || referenceDeclaresBinding(node) || referenceIsModuleBinding(node));
}

export function bindingValueIsStable(name: Identifier): boolean {
    return !hasDynamicScope(name.getSourceFile()) && name.findReferences().every(function (group) {
        return group.getReferences().every(function (reference) {
            return referencePreservesBinding(reference, name);
        });
    });
}

function bindingReferencesOnlyObserveValue(name: Identifier, observe: ReferenceObserver): boolean {
    return name.findReferences().every(function (group) {
        return group.getReferences().every(function (reference) {
            const target = referenceTarget(reference);
            return target !== undefined && observe(target);
        });
    });
}

function valueSymbolAt(reference: Identifier): TypeScriptMorphSymbol | undefined {
    const parent = reference.getParent();
    if (TypeScriptMorphNode.isShorthandPropertyAssignment(parent)) {
        return parent.getValueSymbol();
    }
    return TypeScriptMorphNode.isExportSpecifier(parent) ? parent.getLocalTargetSymbol() : reference.getSymbol();
}

function referenceUsesBinding(reference: TypeScriptMorphNodeType, declaration: TypeScriptMorphNodeType): boolean {
    if (!TypeScriptMorphNode.isIdentifier(reference)) {
        return true;
    }
    const symbol = valueSymbolAt(reference);
    if (symbol === undefined) {
        return true;
    }
    const aliases = symbol.getAliasedSymbol()?.getDeclarations() ?? [];
    return symbol.getDeclarations().includes(declaration) || aliases.includes(declaration);
}

export function bindingHasOnlyUses(
    name: TypeScriptMorphNodeType,
    declaration: TypeScriptMorphNodeType,
    allowed: ReadonlySet<TypeScriptMorphNodeType>
): boolean {
    if (!TypeScriptMorphNode.isIdentifier(name)) {
        return false;
    }
    const declarations = name.getSymbol()?.getDeclarations() ?? [];
    return declarations.length === 1 && declarations[0] === declaration &&
        bindingReferencesOnlyObserveValue(name, function (reference) {
            return reference === name || allowed.has(reference) || !referenceUsesBinding(reference, declaration);
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
    const declarations = reference.getSymbol()?.getDeclarations() ?? [];
    return declarations.length === 1 && declarations.every(sourceMemberCallIsPure);
}

function referenceCreatesAlias(reference: TypeScriptMorphNodeType, observe: ReferenceObserver): boolean {
    const parent = reference.getParent();
    if (
        !TypeScriptMorphNode.isVariableDeclaration(parent) ||
        parent.getInitializer()?.getStart() !== reference.getStart()
    ) {
        return false;
    }
    const name = parent.getNameNode();
    return TypeScriptMorphNode.isIdentifier(name) && bindingReferencesOnlyObserveValue(name, observe);
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
