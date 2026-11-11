import {
    Node as TypeScriptMorphNode,
    SyntaxKind,
    type SourceFile,
    type ImportClause,
    type ImportSpecifier,
    type NamespaceImport
} from 'ts-morph';
import { match } from 'ts-pattern';
import type { BindingDescriptor } from '../reachability/binding-extractor.ts';
import {
    createExportResolver,
    type ExportEntry,
    type ExportOrigin,
    type ExportResolver,
    type ModuleExports
} from './export-resolution.ts';
import type { ModuleExportEntry, ModuleExportModel } from './module-export-model.ts';

export type ExportTargetResolver = (source: SourceFile, specifier: string) => SourceFile | undefined;
export type NamespaceBindingIdentity = 'canonical' | 'local';
export type ImportedExport = { readonly source: SourceFile; readonly name: string | undefined; };
type ExportModule = SourceFile | undefined;
type ImportBinding = ImportClause | ImportSpecifier | NamespaceImport;

export function bindingForExportOrigin(
    origin: ExportOrigin<SourceFile | undefined>,
    models: ReadonlyMap<SourceFile | undefined, ModuleExportModel>
): BindingDescriptor | undefined {
    const locals: ReadonlyMap<string | undefined, BindingDescriptor> | undefined = models.get(origin.module)?.locals;
    return locals?.get(origin.name === '*default*' ? 'default' : origin.name);
}

type ExportContext = {
    readonly model: ModuleExportModel;
    readonly resolveModule: ExportTargetResolver;
    readonly namespaceIdentity: NamespaceBindingIdentity;
};

function exportTarget(context: ExportContext, specifier: string | undefined): ExportModule {
    return specifier === undefined ? undefined : context.resolveModule(context.model.source, specifier);
}

function bindingEntry(module: SourceFile, name: string): ExportEntry<ExportModule> {
    return { kind: 'origin', origin: { module, name } };
}

function forwardedEntry(module: ExportModule, name: string): ExportEntry<ExportModule> {
    return { module, name };
}

function namespaceEntry(module: ExportModule): ExportEntry<ExportModule> {
    return module === undefined ? null : { kind: 'origin', origin: { module, name: undefined } };
}

function importedExportName(declaration: ImportBinding): string | undefined {
    if (TypeScriptMorphNode.isNamespaceImport(declaration)) {
        return undefined;
    }
    return TypeScriptMorphNode.isImportClause(declaration) ? 'default' : declaration.getNameNode().compilerNode.text;
}

export function resolveModuleExport(
    importer: SourceFile,
    specifier: string,
    name: string | undefined,
    resolveModule: ExportTargetResolver
): ImportedExport | undefined {
    const source = resolveModule(importer, specifier);
    return source === undefined ? undefined : { source, name };
}

export function resolveImportedExport(
    declaration: TypeScriptMorphNode | undefined,
    resolveModule: ExportTargetResolver
): ImportedExport | undefined {
    if (
        !(TypeScriptMorphNode.isImportSpecifier(declaration) || TypeScriptMorphNode.isImportClause(declaration) ||
            TypeScriptMorphNode.isNamespaceImport(declaration))
    ) {
        return undefined;
    }
    const imported = declaration.getFirstAncestorByKindOrThrow(SyntaxKind.ImportDeclaration);
    return resolveModuleExport(
        declaration.getSourceFile(),
        imported.getModuleSpecifierValue(),
        importedExportName(declaration),
        resolveModule
    );
}

function importedEntry(
    context: ExportContext,
    declaration: TypeScriptMorphNode,
    name: string
): ExportEntry<ExportModule> {
    const imported = resolveImportedExport(declaration, context.resolveModule);
    if (imported === undefined) {
        return null;
    }
    if (imported.name === undefined) {
        return match(context.namespaceIdentity)
            .with('canonical', function () {
                return namespaceEntry(imported.source);
            })
            .with('local', function () {
                return bindingEntry(context.model.source, name);
            })
            .exhaustive();
    }
    return forwardedEntry(imported.source, imported.name);
}

function localEntry(context: ExportContext, name: string): ExportEntry<ExportModule> {
    const binding = context.model.locals.get(name);
    if (binding === undefined) {
        return null;
    }
    const declaration = binding.declarationNode;
    if (
        TypeScriptMorphNode.isImportSpecifier(declaration) || TypeScriptMorphNode.isImportClause(declaration) ||
        TypeScriptMorphNode.isNamespaceImport(declaration)
    ) {
        return importedEntry(context, declaration, binding.name);
    }
    return bindingEntry(
        context.model.source,
        TypeScriptMorphNode.isExportAssignment(declaration) ? '*default*' : binding.name
    );
}

function resolvedEntry(context: ExportContext, entry: ModuleExportEntry): ExportEntry<ExportModule> {
    return match(entry)
        .with({ kind: 'local' }, function (value) {
            return localEntry(context, value.local);
        })
        .with({ kind: 'anonymous' }, function () {
            return bindingEntry(context.model.source, '*default*');
        })
        .with({ kind: 'namespace' }, function (value) {
            return namespaceEntry(exportTarget(context, value.specifier));
        })
        .otherwise(function (value) {
            return forwardedEntry(exportTarget(context, value.specifier), value.name);
        });
}

function resolvedModule(context: ExportContext): ModuleExports<ExportModule> {
    return {
        closed: context.model.closed,
        entries: new Map(Array.from(context.model.entries, function ([ name, entry ]) {
            return [ name, resolvedEntry(context, entry) ];
        })),
        stars: context.model.stars.map(function (star) {
            return exportTarget(context, star.specifier);
        })
    };
}

export function createModuleExportResolver(
    models: readonly ModuleExportModel[],
    resolveModule: ExportTargetResolver,
    namespaceIdentity: NamespaceBindingIdentity
): ExportResolver<ExportModule> {
    const modules = new Map(models.map(function (model) {
        return [ model.source, resolvedModule({ model, resolveModule, namespaceIdentity }) ] as const;
    }));
    return createExportResolver<ExportModule>(modules);
}
