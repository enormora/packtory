import { Node as TypeScriptMorphNode, type Expression, type SourceFile } from 'ts-morph';
import { match } from 'ts-pattern';
import { constant, hasProp } from 'remeda';
import { constantStatement } from '../evaluation/constant-binding.ts';
import { declarationOf } from '../evaluation/evaluation-context.ts';
import { unwrapExpression } from '../expression-unwrapping.ts';
import type { BindingDescriptor } from '../reachability/binding-extractor.ts';
import type { ModuleExportEntry, ModuleExportModel } from './module-export-model.ts';
import {
    resolveImportedExport,
    resolveModuleExport,
    type ExportTargetResolver,
    type ImportedExport
} from './module-export-resolver.ts';

type ExportSearch = { readonly source: SourceFile; readonly name: string; };
type BindingSearch = { readonly model: ModuleExportModel; readonly name: string; };
type NamespaceValue = { readonly namespace: SourceFile; };
type NamespaceSearch = BindingSearch | ExportSearch | NamespaceValue;
type NamespaceSite = BindingDescriptor | ModuleExportEntry;
type NamespaceContext = {
    readonly models: ReadonlyMap<SourceFile, ModuleExportModel>;
    readonly resolveModule: ExportTargetResolver;
    readonly firstVisit: (site: NamespaceSite) => boolean;
};

function importedSearch(request: ImportedExport | undefined): NamespaceSearch | undefined {
    if (request === undefined) {
        return undefined;
    }
    return request.name === undefined
        ? { namespace: request.source }
        : { source: request.source, name: request.name };
}

function namespaceInitializer(declaration: TypeScriptMorphNode): Expression | undefined {
    if (TypeScriptMorphNode.isExportAssignment(declaration)) {
        return declaration.getExpression();
    }
    return TypeScriptMorphNode.isVariableDeclaration(declaration) && constantStatement(declaration) !== undefined
        ? declaration.getInitializer()
        : undefined;
}

function localBindingSearch(
    declaration: TypeScriptMorphNode | undefined,
    model: ModuleExportModel
): BindingSearch | undefined {
    const binding = Array.from(model.locals.values()).find(function (candidate) {
        return candidate.declarationNode === declaration;
    });
    return binding === undefined ? undefined : { model, name: binding.name };
}

function followExpression(model: ModuleExportModel, expression: Expression | undefined): BindingSearch | undefined {
    const value = unwrapExpression(expression);
    return localBindingSearch(value === undefined ? undefined : declarationOf(value), model);
}

function followBinding(search: BindingSearch, context: NamespaceContext): NamespaceSearch | undefined {
    const binding = search.model.locals.get(search.name);
    if (binding === undefined || !context.firstVisit(binding)) {
        return undefined;
    }
    const imported = resolveImportedExport(binding.declarationNode, context.resolveModule);
    if (imported !== undefined) {
        return importedSearch(imported);
    }
    const expression = namespaceInitializer(binding.declarationNode);
    return followExpression(search.model, expression);
}

function followExport(search: ExportSearch, context: NamespaceContext): NamespaceSearch | undefined {
    const model = context.models.get(search.source);
    if (model === undefined) {
        return undefined;
    }
    const entry = model.entries.get(search.name);
    if (entry === undefined || !context.firstVisit(entry)) {
        return undefined;
    }
    return match(entry)
        .with({ kind: 'local' }, function (value): NamespaceSearch {
            return { model, name: value.local };
        })
        .with({ kind: 'namespace' }, function (value): NamespaceSearch | undefined {
            const request = value.specifier === undefined
                ? undefined
                : resolveModuleExport(search.source, value.specifier, undefined, context.resolveModule);
            return importedSearch(request);
        })
        .with({ kind: 'forward' }, function (value): NamespaceSearch | undefined {
            return importedSearch(
                resolveModuleExport(search.source, value.specifier, value.name, context.resolveModule)
            );
        })
        .otherwise(constant(undefined));
}

function initialSearch(
    declaration: TypeScriptMorphNode | undefined,
    models: ReadonlyMap<SourceFile, ModuleExportModel>,
    resolveModule: ExportTargetResolver
): NamespaceSearch | undefined {
    const imported = importedSearch(resolveImportedExport(declaration, resolveModule));
    if (imported !== undefined) {
        return imported;
    }
    if (!TypeScriptMorphNode.isVariableDeclaration(declaration)) {
        return undefined;
    }
    const model = models.get(declaration.getSourceFile());
    if (model === undefined) {
        return undefined;
    }
    return localBindingSearch(declaration, model);
}

function resolveNamespaceSearch(
    initial: NamespaceSearch | undefined,
    models: ReadonlyMap<SourceFile, ModuleExportModel>,
    resolveModule: ExportTargetResolver
): SourceFile | undefined {
    const seen = new Set<NamespaceSite>();
    const context: NamespaceContext = {
        models,
        resolveModule,
        firstVisit(site) {
            if (seen.has(site)) {
                return false;
            }
            seen.add(site);
            return true;
        }
    };
    let search = initial;
    while (search !== undefined) {
        if (hasProp(search, 'namespace')) {
            return search.namespace;
        }
        search = hasProp(search, 'model') ? followBinding(search, context) : followExport(search, context);
    }
    return undefined;
}

export function resolveNamespaceImport(
    declaration: TypeScriptMorphNode | undefined,
    models: ReadonlyMap<SourceFile, ModuleExportModel>,
    resolveModule: ExportTargetResolver
): SourceFile | undefined {
    return resolveNamespaceSearch(initialSearch(declaration, models, resolveModule), models, resolveModule);
}

export function resolveNamespaceExport(
    source: SourceFile,
    name: string,
    models: ReadonlyMap<SourceFile, ModuleExportModel>,
    resolveModule: ExportTargetResolver
): SourceFile | undefined {
    return resolveNamespaceSearch({ source, name }, models, resolveModule);
}
