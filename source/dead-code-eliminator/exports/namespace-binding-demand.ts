import { Node as TypeScriptMorphNode, SyntaxKind, type Identifier, type SourceFile } from 'ts-morph';
import { bindingHasOnlyUses } from '../binding-stability.ts';
import { hasDynamicScope } from '../dynamic-scope.ts';
import { constantStatement } from '../evaluation/constant-binding.ts';
import {
    allNamespaceProperties,
    mergeNamespaceDemand,
    noNamespaceProperties,
    type NamespaceDemand
} from './namespace-demand.ts';
import type { NamespaceExpressionContext } from './namespace-expression-demand.ts';

export type NamespaceBindingContext = Pick<NamespaceExpressionContext, 'binding' | 'exported' | 'expression'> & {
    readonly analyzedFiles: ReadonlySet<SourceFile>;
    readonly references: (name: Identifier) => readonly (TypeScriptMorphNode | undefined)[];
    readonly isObserved: (reference: TypeScriptMorphNode) => boolean;
};

function bindingName(declaration: TypeScriptMorphNode): TypeScriptMorphNode | undefined {
    if (TypeScriptMorphNode.isImportClause(declaration)) {
        return declaration.getDefaultImport();
    }
    if (TypeScriptMorphNode.isImportSpecifier(declaration)) {
        return declaration.getAliasNode() ?? declaration.getNameNode();
    }
    return TypeScriptMorphNode.isNamespaceImport(declaration) || TypeScriptMorphNode.isVariableDeclaration(declaration)
        ? declaration.getNameNode()
        : undefined;
}

function isModuleExportReference(reference: TypeScriptMorphNode): boolean {
    const parent = reference.getParent();
    return TypeScriptMorphNode.isStringLiteral(reference) && TypeScriptMorphNode.isExportSpecifier(parent) ||
        reference.getKind() === SyntaxKind.DefaultKeyword && TypeScriptMorphNode.isExportAssignment(parent);
}

function isAnalyzedReference(
    reference: TypeScriptMorphNode | undefined,
    analyzedFiles: ReadonlySet<SourceFile>
): reference is TypeScriptMorphNode {
    if (reference === undefined || !analyzedFiles.has(reference.getSourceFile())) {
        return false;
    }
    return TypeScriptMorphNode.isIdentifier(reference) || isModuleExportReference(reference);
}

function checkedReferences(
    name: Identifier,
    declaration: TypeScriptMorphNode,
    context: NamespaceBindingContext
): readonly TypeScriptMorphNode[] | undefined {
    const raw = context.references(name);
    const references = raw.filter(function (reference) {
        return isAnalyzedReference(reference, context.analyzedFiles);
    });
    return references.length === raw.length && bindingHasOnlyUses(name, declaration, new Set(references))
        ? references
        : undefined;
}

function declaresBinding(reference: TypeScriptMorphNode): boolean {
    const parent = reference.getParent();
    if (
        TypeScriptMorphNode.isImportClause(parent) || TypeScriptMorphNode.isImportSpecifier(parent) ||
        TypeScriptMorphNode.isNamespaceImport(parent)
    ) {
        return true;
    }
    return TypeScriptMorphNode.isVariableDeclaration(parent) && parent.getNameNode() === reference;
}

function referenceDemand(reference: TypeScriptMorphNode, context: NamespaceBindingContext): NamespaceDemand {
    const parent = reference.getParent();
    if (reference.getKind() === SyntaxKind.DefaultKeyword && TypeScriptMorphNode.isExportAssignment(parent)) {
        return context.exported(parent.getSourceFile(), 'default');
    }
    return declaresBinding(reference) ? context.binding(reference.getParentOrThrow()) : context.expression(reference);
}

function initialDemand(
    declaration: TypeScriptMorphNode,
    name: Identifier,
    context: NamespaceBindingContext
): NamespaceDemand | undefined {
    if (!TypeScriptMorphNode.isVariableDeclaration(declaration)) {
        return noNamespaceProperties;
    }
    const statement = constantStatement(declaration);
    if (statement === undefined) {
        return undefined;
    }
    return statement.isExported()
        ? context.exported(declaration.getSourceFile(), name.getText())
        : noNamespaceProperties;
}

export function namespaceBindingDemand(
    declaration: TypeScriptMorphNode,
    context: NamespaceBindingContext
): NamespaceDemand {
    const name = bindingName(declaration);
    if (
        !TypeScriptMorphNode.isIdentifier(name) || !context.analyzedFiles.has(declaration.getSourceFile()) ||
        hasDynamicScope(declaration.getSourceFile())
    ) {
        return allNamespaceProperties;
    }
    const initial = initialDemand(declaration, name, context);
    if (initial === undefined) {
        return allNamespaceProperties;
    }
    const references = checkedReferences(name, declaration, context);
    if (references === undefined) {
        return allNamespaceProperties;
    }
    return references.filter(context.isObserved).reduce(function (demand, reference) {
        return mergeNamespaceDemand(demand, referenceDemand(reference, context));
    }, initial);
}
