import { Node as TypeScriptMorphNode, type Expression, type SourceFile } from 'ts-morph';
import { match } from 'ts-pattern';
import { constant, hasProp } from 'remeda';
import { constantStatement } from '../evaluation/constant-binding.ts';
import { declarationOf } from '../evaluation/evaluation-context.ts';
import { unwrapExpression } from '../expression-unwrapping.ts';
import type { BindingDescriptor } from '../reachability/binding-extractor.ts';
import { collectBindingDependencies } from './binding-dependencies.ts';
import type { ModuleExportEntry, ModuleExportModel } from './module-export-model.ts';
import {
    resolveImportedExport,
    resolveModuleExport,
    type ExportTargetResolver,
    type ImportedExport
} from './module-export-resolver.ts';

type ExportSearch = { readonly model: ModuleExportModel; readonly entry: ModuleExportEntry; };
type BindingSearch = { readonly model: ModuleExportModel; readonly binding: BindingDescriptor; };
type NamespaceValue = { readonly namespace: SourceFile; };
type NamespaceRequest = BindingSearch | ExportSearch;
type NamespaceSearch = NamespaceRequest | NamespaceValue;
type NamespaceSite = BindingDescriptor | ModuleExportEntry;
type NamespaceNode = NamespaceSite | NamespaceValue;
type NamespaceRequests = ReadonlyMap<NamespaceNode, NamespaceRequest> & {
    readonly set: (site: NamespaceNode, request: NamespaceRequest) => void;
};
type NamespaceContext = {
    readonly models: ReadonlyMap<SourceFile, ModuleExportModel>;
    readonly resolveModule: ExportTargetResolver;
};

function exportSearch(source: SourceFile, name: string, context: NamespaceContext): ExportSearch | undefined {
    const model = context.models.get(source);
    if (model === undefined) {
        return undefined;
    }
    const entry = model.entries.get(name);
    return entry === undefined ? undefined : { model, entry };
}

function importedSearch(request: ImportedExport | undefined, context: NamespaceContext): NamespaceSearch | undefined {
    if (request === undefined) {
        return undefined;
    }
    return request.name === undefined
        ? { namespace: request.source }
        : exportSearch(request.source, request.name, context);
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
    return binding === undefined ? undefined : { model, binding };
}

function followExpression(model: ModuleExportModel, expression: Expression | undefined): BindingSearch | undefined {
    const value = unwrapExpression(expression);
    return localBindingSearch(value === undefined ? undefined : declarationOf(value), model);
}

function followBinding(search: BindingSearch, context: NamespaceContext): NamespaceSearch | undefined {
    const { binding } = search;
    const imported = resolveImportedExport(binding.declarationNode, context.resolveModule);
    if (imported !== undefined) {
        return importedSearch(imported, context);
    }
    const expression = namespaceInitializer(binding.declarationNode);
    return followExpression(search.model, expression);
}

function followExport(search: ExportSearch, context: NamespaceContext): NamespaceSearch | undefined {
    const { model, entry } = search;
    return match(entry)
        .with({ kind: 'local' }, function (value): NamespaceSearch | undefined {
            const binding = model.locals.get(value.local);
            return binding === undefined ? undefined : { model, binding };
        })
        .with({ kind: 'namespace' }, function (value): NamespaceSearch | undefined {
            const request = value.specifier === undefined
                ? undefined
                : resolveModuleExport(model.source, value.specifier, undefined, context.resolveModule);
            return importedSearch(request, context);
        })
        .with({ kind: 'anonymous' }, constant(undefined))
        .otherwise(function (value): NamespaceSearch | undefined {
            return importedSearch(
                resolveModuleExport(model.source, value.specifier, value.name, context.resolveModule),
                context
            );
        });
}

function initialSearch(
    declaration: TypeScriptMorphNode | undefined,
    context: NamespaceContext
): NamespaceSearch | undefined {
    const imported = importedSearch(resolveImportedExport(declaration, context.resolveModule), context);
    if (imported !== undefined) {
        return imported;
    }
    if (!TypeScriptMorphNode.isVariableDeclaration(declaration)) {
        return undefined;
    }
    const model = context.models.get(declaration.getSourceFile());
    if (model === undefined) {
        return undefined;
    }
    return localBindingSearch(declaration, model);
}

function namespaceSite(search: NamespaceRequest): NamespaceSite {
    return hasProp(search, 'binding') ? search.binding : search.entry;
}

function* namespaceNeighbors(
    search: NamespaceRequest,
    context: NamespaceContext,
    requests: NamespaceRequests
): Generator<NamespaceNode> {
    const next = hasProp(search, 'binding') ? followBinding(search, context) : followExport(search, context);
    if (next === undefined) {
        return;
    }
    if (hasProp(next, 'namespace')) {
        yield next;
        return;
    }
    const site = namespaceSite(next);
    requests.set(site, next);
    yield site;
}

function resolveNamespaceSearch(
    initial: NamespaceSearch | undefined,
    context: NamespaceContext
): SourceFile | undefined {
    if (initial === undefined) {
        return undefined;
    }
    if (hasProp(initial, 'namespace')) {
        return initial.namespace;
    }
    const requests = new Map<NamespaceNode, NamespaceRequest>([ [ namespaceSite(initial), initial ] ]);
    const leaves = collectBindingDependencies<NamespaceNode>(namespaceSite(initial), {
        get(site) {
            const search = requests.get(site);
            return search === undefined ? undefined : function () {
                return namespaceNeighbors(search, context, requests);
            };
        }
    });
    return leaves
        .find(function (leaf) {
            return hasProp(leaf, 'namespace');
        })
        ?.namespace;
}

export function resolveNamespaceImport(
    declaration: TypeScriptMorphNode | undefined,
    models: ReadonlyMap<SourceFile, ModuleExportModel>,
    resolveModule: ExportTargetResolver
): SourceFile | undefined {
    const context = { models, resolveModule };
    return resolveNamespaceSearch(initialSearch(declaration, context), context);
}

export function resolveNamespaceExport(
    source: SourceFile,
    name: string,
    models: ReadonlyMap<SourceFile, ModuleExportModel>,
    resolveModule: ExportTargetResolver
): SourceFile | undefined {
    const context = { models, resolveModule };
    return resolveNamespaceSearch(exportSearch(source, name, context), context);
}
