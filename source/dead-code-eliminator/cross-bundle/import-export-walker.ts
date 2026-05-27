import { Node as TsMorphNode, type ExportDeclaration, type ImportDeclaration, type SourceFile } from 'ts-morph';
import { bindingId } from '../reachability/binding-id.ts';
import { resolveCrossBundleTarget, type IndexedBundle, type ResolvedTarget } from './bundle-index.ts';
import { recordSeed, seedAllBindings, type MutableSeedMap } from './seed-store.ts';

type WalkContext = {
    readonly indexed: ReadonlyMap<string, IndexedBundle>;
    readonly seeds: MutableSeedMap;
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
): void {
    const defaultImport = importDeclaration.getDefaultImport();
    if (defaultImport === undefined) {
        return;
    }
    if (!isLocalBindingReachable(context, defaultImport.getText())) {
        return;
    }
    recordSeed(context.seeds, target.bundleName, bindingId(target.sourceFilePath, 'default'));
}

function recordNamedImportSeeds(
    importDeclaration: ImportDeclaration,
    target: ResolvedTarget,
    context: WalkContext
): void {
    for (const namedImport of importDeclaration.getNamedImports()) {
        if (isLocalBindingReachable(context, localNameOfNamedImport(namedImport))) {
            recordSeed(context.seeds, target.bundleName, bindingId(target.sourceFilePath, namedImport.getName()));
        }
    }
}

function processImportDeclaration(importDeclaration: ImportDeclaration, context: WalkContext): void {
    const target = resolveCrossBundleTarget(importDeclaration.getModuleSpecifierValue(), context.indexed);
    if (target === undefined) {
        return;
    }
    const namespaceImport = importDeclaration.getNamespaceImport();
    if (namespaceImport !== undefined) {
        if (isLocalBindingReachable(context, namespaceImport.getText())) {
            seedAllBindings(context.seeds, target);
        }
        return;
    }
    recordDefaultImportSeed(importDeclaration, target, context);
    recordNamedImportSeeds(importDeclaration, target, context);
}

function recordNamedReExportSeeds(
    exportDeclaration: ExportDeclaration,
    target: ResolvedTarget,
    seeds: MutableSeedMap
): void {
    for (const namedExport of exportDeclaration.getNamedExports()) {
        recordSeed(seeds, target.bundleName, bindingId(target.sourceFilePath, namedExport.getName()));
    }
}

function processExportDeclaration(exportDeclaration: ExportDeclaration, context: WalkContext): void {
    const specifier = exportDeclaration.getModuleSpecifierValue() ?? context.sourceFilePath;
    const target = resolveCrossBundleTarget(specifier, context.indexed);
    if (target === undefined) {
        return;
    }
    if (exportDeclaration.isNamespaceExport()) {
        seedAllBindings(context.seeds, target);
        return;
    }
    recordNamedReExportSeeds(exportDeclaration, target, context.seeds);
}

export function walkCrossBundleStatements(sourceFile: Readonly<SourceFile>, context: WalkContext): void {
    for (const statement of sourceFile.getStatements()) {
        if (TsMorphNode.isImportDeclaration(statement)) {
            processImportDeclaration(statement, context);
        } else if (TsMorphNode.isExportDeclaration(statement)) {
            processExportDeclaration(statement, context);
        }
    }
}
