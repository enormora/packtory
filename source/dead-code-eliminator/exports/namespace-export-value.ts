import { Node as TypeScriptMorphNode, type Expression, type SourceFile } from 'ts-morph';
import { match, P } from 'ts-pattern';
import { constantStatement } from '../evaluation/constant-binding.ts';
import { unwrapExpression } from '../expression-unwrapping.ts';
import type { BindingDescriptor } from '../reachability/binding-extractor.ts';
import type { ModuleExportEntry, ModuleExportModel } from './module-export-model.ts';
import { resolveImportedExport, type ExportTargetResolver, type ImportedExport } from './module-export-resolver.ts';

type ExportSearch = { readonly kind: 'export'; readonly source: SourceFile; readonly name: string; };
type BindingSearch = { readonly kind: 'binding'; readonly source: SourceFile; readonly name: string; };
type NamespaceValue = { readonly kind: 'namespace'; readonly source: SourceFile; };
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
        ? { kind: 'namespace', source: request.source }
        : { kind: 'export', source: request.source, name: request.name };
}

function namespaceInitializer(declaration: TypeScriptMorphNode): Expression | undefined {
    if (TypeScriptMorphNode.isExportAssignment(declaration)) {
        return declaration.getExpression();
    }
    return TypeScriptMorphNode.isVariableDeclaration(declaration) && constantStatement(declaration) !== undefined
        ? declaration.getInitializer()
        : undefined;
}

function followExpression(
    source: SourceFile,
    expression: Expression,
    context: NamespaceContext
): NamespaceSearch | undefined {
    const value = unwrapExpression(expression);
    if (!TypeScriptMorphNode.isIdentifier(value)) {
        return undefined;
    }
    const binding = context.models.get(source)?.locals.get(value.getText());
    if (binding === undefined || value.getSymbol()?.getDeclarations().includes(binding.declarationNode) !== true) {
        return undefined;
    }
    return { kind: 'binding', source, name: binding.name };
}

function followBinding(search: BindingSearch, context: NamespaceContext): NamespaceSearch | undefined {
    const binding = context.models.get(search.source)?.locals.get(search.name);
    if (binding === undefined || !context.firstVisit(binding)) {
        return undefined;
    }
    const imported = resolveImportedExport(binding.declarationNode, context.resolveModule);
    if (imported !== undefined) {
        return importedSearch(imported);
    }
    const expression = namespaceInitializer(binding.declarationNode);
    return expression === undefined ? undefined : followExpression(search.source, expression, context);
}

function followExport(search: ExportSearch, context: NamespaceContext): NamespaceSearch | undefined {
    const entry = context.models.get(search.source)?.entries.get(search.name);
    if (entry === undefined || !context.firstVisit(entry)) {
        return undefined;
    }
    return match(entry)
        .with({ kind: 'local' }, function (value): NamespaceSearch {
            return { kind: 'binding', source: search.source, name: value.local };
        })
        .with({ kind: 'anonymous' }, function () {
            return undefined;
        })
        .with({ kind: P.union('namespace', 'forward') }, function (value): NamespaceSearch | undefined {
            const target = value.specifier === undefined
                ? undefined
                : context.resolveModule(search.source, value.specifier);
            if (target === undefined) {
                return undefined;
            }
            return value.kind === 'namespace'
                ? { kind: 'namespace', source: target }
                : { kind: 'export', source: target, name: value.name };
        })
        .exhaustive();
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
    const source = declaration.getSourceFile();
    const binding = Array.from(models.get(source)?.locals.values() ?? []).find(function (candidate) {
        return candidate.declarationNode === declaration;
    });
    return binding === undefined ? undefined : { kind: 'binding', source, name: binding.name };
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
        if (search.kind === 'namespace') {
            return search.source;
        }
        search = search.kind === 'binding' ? followBinding(search, context) : followExport(search, context);
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
    return resolveNamespaceSearch({ kind: 'export', source, name }, models, resolveModule);
}
