import { Node as TsMorphNode, type ExportDeclaration, type ImportDeclaration, type SourceFile } from 'ts-morph';
import type { ArtifactModuleReference } from '../../resource-resolver/resolved-bundle.ts';
import { bindingId } from '../reachability/binding-id.ts';
import type { CrossBundleSeedReason, DeadCodeEliminationTrace } from '../trace.ts';
import type { IndexedBundle, ResolvedTarget } from './bundle-index.ts';
import { recordSeed, type SeedMap } from './seed-store.ts';

export type WalkContext = {
    readonly indexed: ReadonlyMap<string, IndexedBundle>;
    readonly seeds: SeedMap;
    readonly sourceBundleName: string;
    readonly inputFilePath: string;
    readonly sourceTargetFilePath: string;
    readonly moduleReferences: readonly ArtifactModuleReference[];
    readonly localReachable: ReadonlySet<string>;
    readonly trace: DeadCodeEliminationTrace;
};

type SeedStatement = ExportDeclaration | ImportDeclaration;
type LinkedCodeReference = Extract<ArtifactModuleReference, { readonly type: 'linked-code'; }>;

type CrossBundleSeedInput = {
    readonly context: WalkContext;
    readonly target: ResolvedTarget;
    readonly seed: string;
    readonly statement: SeedStatement;
    readonly reason: CrossBundleSeedReason;
};

type TargetBindingSeedInput = {
    readonly context: WalkContext;
    readonly target: ResolvedTarget;
    readonly name: string;
    readonly statement: SeedStatement;
    readonly reason: CrossBundleSeedReason;
};

function localNameOfNamedImport(namedImport: ReturnType<ImportDeclaration['getNamedImports']>[number]): string {
    const aliasNode = namedImport.getAliasNode();
    return aliasNode === undefined ? namedImport.getName() : aliasNode.getText();
}

function isLocalBindingReachable(context: WalkContext, localName: string): boolean {
    return context.localReachable.has(bindingId(context.sourceTargetFilePath, localName));
}

function seedExists(seeds: SeedMap, bundleName: string, seed: string): boolean {
    return seeds.get(bundleName)?.has(seed) === true;
}

function isLinkedCodeReference(reference: ArtifactModuleReference): reference is LinkedCodeReference {
    return reference.type === 'linked-code';
}

function recordCrossBundleSeed(input: CrossBundleSeedInput): SeedMap {
    const { context, reason, seed, statement, target } = input;
    if (!seedExists(context.seeds, target.bundleName, seed) && context.trace !== undefined) {
        context.trace.collector.record({
            type: 'cross-bundle-seed-added',
            bundleName: target.bundleName,
            bindingId: seed,
            sourceBundleName: context.sourceBundleName,
            inputFilePath: context.inputFilePath,
            line: statement.getStartLineNumber(),
            moduleSpecifier: statement.getModuleSpecifierValue() ?? context.inputFilePath,
            reason
        });
    }
    return recordSeed(context.seeds, target.bundleName, seed);
}

function seedTargetBinding(input: TargetBindingSeedInput): SeedMap {
    const { context, name, reason, statement, target } = input;
    return recordCrossBundleSeed({
        context,
        target,
        seed: bindingId(target.targetFilePath, name),
        statement,
        reason
    });
}

function seedAllTargetBindings(
    context: WalkContext,
    target: ResolvedTarget,
    statement: SeedStatement,
    reason: CrossBundleSeedReason
): SeedMap {
    const fileBindings = target.indexedBundle.bindingsByFilePath.get(target.targetFilePath);
    if (fileBindings === undefined) {
        return context.seeds;
    }
    const { bindings } = fileBindings;
    let { seeds } = context;
    for (const binding of bindings) {
        seeds = seedTargetBinding({
            context: { ...context, seeds },
            target,
            name: binding.name,
            statement,
            reason
        });
    }
    return seeds;
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
    return seedTargetBinding({
        context,
        target,
        name: 'default',
        statement: importDeclaration,
        reason: 'default-import'
    });
}

function recordNamedImportSeeds(
    importDeclaration: ImportDeclaration,
    target: ResolvedTarget,
    context: WalkContext
): SeedMap {
    let { seeds } = context;
    for (const namedImport of importDeclaration.getNamedImports()) {
        if (isLocalBindingReachable(context, localNameOfNamedImport(namedImport))) {
            seeds = seedTargetBinding({
                context: { ...context, seeds },
                target,
                name: namedImport.getName(),
                statement: importDeclaration,
                reason: 'named-import'
            });
        }
    }
    return seeds;
}

function linkedReferenceFor(statement: SeedStatement, context: WalkContext): LinkedCodeReference | undefined {
    const specifier = statement.getModuleSpecifierValue();
    if (specifier === undefined) {
        return undefined;
    }
    return context.moduleReferences.filter(isLinkedCodeReference).find(function (reference) {
        return reference.emittedSpecifier === specifier;
    });
}

function crossBundleTarget(statement: SeedStatement, context: WalkContext): ResolvedTarget | undefined {
    const reference = linkedReferenceFor(statement, context);
    if (reference === undefined) {
        return undefined;
    }
    const indexedBundle = context.indexed.get(reference.packageName);
    if (indexedBundle === undefined) {
        return undefined;
    }
    if (!indexedBundle.bindingsByFilePath.has(reference.targetFilePath)) {
        return undefined;
    }
    return { bundleName: reference.packageName, targetFilePath: reference.targetFilePath, indexedBundle };
}

function processImportDeclaration(importDeclaration: ImportDeclaration, context: WalkContext): SeedMap {
    const target = crossBundleTarget(importDeclaration, context);
    if (target === undefined) {
        return context.seeds;
    }
    const namespaceImport = importDeclaration.getNamespaceImport();
    if (namespaceImport !== undefined) {
        if (isLocalBindingReachable(context, namespaceImport.getText())) {
            return seedAllTargetBindings(context, target, importDeclaration, 'namespace-import');
        }
        return context.seeds;
    }
    const seeds = recordDefaultImportSeed(importDeclaration, target, context);
    return recordNamedImportSeeds(importDeclaration, target, { ...context, seeds });
}

function recordNamedReExportSeeds(
    exportDeclaration: ExportDeclaration,
    target: ResolvedTarget,
    context: WalkContext
): SeedMap {
    let nextSeeds = context.seeds;
    for (const namedExport of exportDeclaration.getNamedExports()) {
        nextSeeds = seedTargetBinding({
            context: { ...context, seeds: nextSeeds },
            target,
            name: namedExport.getName(),
            statement: exportDeclaration,
            reason: 'named-reexport'
        });
    }
    return nextSeeds;
}

function processExportDeclaration(exportDeclaration: ExportDeclaration, context: WalkContext): SeedMap {
    const target = crossBundleTarget(exportDeclaration, context);
    if (target === undefined) {
        return context.seeds;
    }
    if (exportDeclaration.isNamespaceExport()) {
        return seedAllTargetBindings(context, target, exportDeclaration, 'namespace-reexport');
    }
    return recordNamedReExportSeeds(exportDeclaration, target, context);
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
