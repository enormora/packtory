import { Node as TsMorphNode, type ExportDeclaration, type ImportDeclaration, type SourceFile } from 'ts-morph';
import { bindingId } from '../reachability/binding-id.ts';
import { resolveCrossBundleTarget, type IndexedBundle, type ResolvedTarget } from './bundle-index.ts';
import { recordSeed, seedAllBindings, type SeedMap } from './seed-store.ts';

type WalkContext = {
    readonly indexed: ReadonlyMap<string, IndexedBundle>;
    readonly seeds: SeedMap;
    readonly sourceFilePath: string;
    readonly localReachable: ReadonlySet<string>;
};

function localNameOfNamedImport(namedImport: ReturnType<ImportDeclaration['getNamedImports']>[number]): string {
    const aliasNode = namedImport.getAliasNode();
    return aliasNode === undefined ? namedImport.getName() : aliasNode.getText();
}

function isLocalBindingReachable(context: WalkContext, localName: string): boolean {
    return context.localReachable.has(bindingId(context.sourceFilePath, localName));
}

function recordDefaultImportSeed(
    importDeclaration: ImportDeclaration,
    target: ResolvedTarget,
    context: WalkContext
): SeedMap {
    const defaultImport = importDeclaration.getDefaultImport();
    if (defaultImport === undefined) {
        return context.seeds;
    }
    if (!isLocalBindingReachable(context, defaultImport.getText())) {
        return context.seeds;
    }
    return recordSeed(context.seeds, target.bundleName, bindingId(target.sourceFilePath, 'default'));
}

function recordNamedImportSeeds(
    importDeclaration: ImportDeclaration,
    target: ResolvedTarget,
    context: WalkContext
): SeedMap {
    let { seeds } = context;
    for (const namedImport of importDeclaration.getNamedImports()) {
        if (isLocalBindingReachable(context, localNameOfNamedImport(namedImport))) {
            seeds = recordSeed(seeds, target.bundleName, bindingId(target.sourceFilePath, namedImport.getName()));
        }
    }
    return seeds;
}

function processImportDeclaration(importDeclaration: ImportDeclaration, context: WalkContext): SeedMap {
    const target = resolveCrossBundleTarget(importDeclaration.getModuleSpecifierValue(), context.indexed);
    if (target === undefined) {
        return context.seeds;
    }
    const namespaceImport = importDeclaration.getNamespaceImport();
    if (namespaceImport !== undefined) {
        if (isLocalBindingReachable(context, namespaceImport.getText())) {
            return seedAllBindings(context.seeds, target);
        }
        return context.seeds;
    }
    const seeds = recordDefaultImportSeed(importDeclaration, target, context);
    return recordNamedImportSeeds(importDeclaration, target, { ...context, seeds });
}

function recordNamedReExportSeeds(
    exportDeclaration: ExportDeclaration,
    target: ResolvedTarget,
    seeds: SeedMap
): SeedMap {
    let nextSeeds = seeds;
    for (const namedExport of exportDeclaration.getNamedExports()) {
        nextSeeds = recordSeed(nextSeeds, target.bundleName, bindingId(target.sourceFilePath, namedExport.getName()));
    }
    return nextSeeds;
}

function processExportDeclaration(exportDeclaration: ExportDeclaration, context: WalkContext): SeedMap {
    const specifier = exportDeclaration.getModuleSpecifierValue() ?? context.sourceFilePath;
    const target = resolveCrossBundleTarget(specifier, context.indexed);
    if (target === undefined) {
        return context.seeds;
    }
    if (exportDeclaration.isNamespaceExport()) {
        return seedAllBindings(context.seeds, target);
    }
    return recordNamedReExportSeeds(exportDeclaration, target, context.seeds);
}

export function walkCrossBundleStatements(sourceFile: Readonly<SourceFile>, context: WalkContext): SeedMap {
    let { seeds } = context;
    for (const statement of sourceFile.getStatements()) {
        if (TsMorphNode.isImportDeclaration(statement)) {
            seeds = processImportDeclaration(statement, { ...context, seeds });
        } else if (TsMorphNode.isExportDeclaration(statement)) {
            seeds = processExportDeclaration(statement, { ...context, seeds });
        }
    }
    return seeds;
}
