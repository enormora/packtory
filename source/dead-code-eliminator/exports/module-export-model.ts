import {
    Node as TypeScriptMorphNode,
    type ClassDeclaration,
    type ExportDeclaration,
    type FunctionDeclaration,
    type SourceFile,
    type Statement
} from 'ts-morph';
import { extractTopLevelBindings, type BindingDescriptor } from '../reachability/binding-extractor.ts';

type LocalExport = { readonly kind: 'local'; readonly local: string; };
type AnonymousExport = { readonly kind: 'anonymous'; };
type NamespaceExport = { readonly kind: 'namespace'; readonly specifier: string | undefined; };
type ForwardedExport = { readonly kind: 'forward'; readonly specifier: string; readonly name: string; };
export type ModuleExportEntry = AnonymousExport | ForwardedExport | LocalExport | NamespaceExport;

type StarExport = {
    readonly specifier: string | undefined;
    readonly declaration: ExportDeclaration;
};

export type ModuleExportModel = {
    readonly source: SourceFile;
    readonly locals: ReadonlyMap<string, BindingDescriptor>;
    readonly entries: ReadonlyMap<string, ModuleExportEntry>;
    readonly stars: readonly StarExport[];
    readonly closed: boolean;
};

type NamedExport = readonly [string, ModuleExportEntry];

export function isOrdinaryStarExport(declaration: ExportDeclaration): boolean {
    return declaration.isNamespaceExport() && declaration.getNamespaceExport() === undefined;
}

function isDefaultDeclaration(statement: Statement): statement is ClassDeclaration | FunctionDeclaration {
    return (TypeScriptMorphNode.isFunctionDeclaration(statement) ||
        TypeScriptMorphNode.isClassDeclaration(statement)) &&
        statement.isDefaultExport();
}

function bindingExport(binding: BindingDescriptor): NamedExport {
    const isDefault = TypeScriptMorphNode.isExportAssignment(binding.statement) ||
        isDefaultDeclaration(binding.statement);
    return [ isDefault ? 'default' : binding.name, { kind: 'local', local: binding.name } ];
}

function anonymousDefaultExport(statement: Statement): readonly NamedExport[] {
    if (!isDefaultDeclaration(statement)) {
        return [];
    }
    return statement.getName() === undefined
        ? [ [ 'default', { kind: 'anonymous' } ] ]
        : [];
}

function declarationExports(declaration: ExportDeclaration): readonly NamedExport[] {
    if (declaration.isTypeOnly()) {
        return [];
    }
    const specifier = declaration.getModuleSpecifierValue();
    const namespace = declaration.getNamespaceExport();
    if (namespace !== undefined) {
        return [ [ namespace.getName(), { kind: 'namespace', specifier } ] ];
    }
    return declaration
        .getNamedExports()
        .filter(function (exported) {
            return !exported.isTypeOnly();
        })
        .map(function (exported): NamedExport {
            const name = exported.getNameNode().compilerNode.text;
            const exportedName = (exported.getAliasNode() ?? exported.getNameNode()).compilerNode.text;
            return [
                exportedName,
                specifier === undefined
                    ? { kind: 'local', local: name }
                    : { kind: 'forward', specifier, name }
            ];
        });
}

function opaqueStatement(statement: Statement): boolean {
    return TypeScriptMorphNode.isAmbientable(statement) && statement.isAmbient() ||
        TypeScriptMorphNode.isInterfaceDeclaration(statement) ||
        TypeScriptMorphNode.isTypeAliasDeclaration(statement) ||
        TypeScriptMorphNode.isExportAssignment(statement) && statement.isExportEquals();
}

function containsTypeOnlyRequests(source: SourceFile): boolean {
    return source.getImportDeclarations().some(function (declaration) {
        return declaration.isTypeOnly() || declaration.getNamedImports().some(function (imported) {
            return imported.isTypeOnly();
        });
    }) || source.getExportDeclarations().some(function (declaration) {
        return declaration.isTypeOnly() || declaration.getNamedExports().some(function (exported) {
            return exported.isTypeOnly();
        });
    });
}

function hasModuleSyntax(source: SourceFile, bindings: readonly BindingDescriptor[]): boolean {
    return source.getImportDeclarations().length > 0 || source.getExportDeclarations().length > 0 ||
        bindings.some(function (binding) {
            return binding.isExported;
        }) ||
        source.getStatements().some(isDefaultDeclaration);
}

function closedExportNames(source: SourceFile, bindings: readonly BindingDescriptor[]): boolean {
    return hasModuleSyntax(source, bindings) && !source.isDeclarationFile() &&
        !source.getFilePath().endsWith('.cjs') && !source.getFilePath().endsWith('.cts') &&
        !source.getStatements().some(opaqueStatement) && !containsTypeOnlyRequests(source);
}

export function readModuleExportModel(source: SourceFile): ModuleExportModel {
    const bindings = extractTopLevelBindings(source);
    const declarations = source.getExportDeclarations();
    const exportedBindings = bindings.filter(function (binding) {
        return binding.isExported;
    });
    return {
        source,
        locals: new Map(bindings.map(function (binding) {
            return [ binding.name, binding ];
        })),
        entries: new Map([
            ...exportedBindings.map(bindingExport),
            ...source.getStatements().flatMap(anonymousDefaultExport),
            ...declarations.flatMap(declarationExports)
        ]),
        stars: declarations
            .filter(function (declaration) {
                return !declaration.isTypeOnly() && isOrdinaryStarExport(declaration);
            })
            .map(function (declaration) {
                return { specifier: declaration.getModuleSpecifierValue(), declaration };
            }),
        closed: closedExportNames(source, bindings)
    };
}
