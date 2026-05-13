import { Node as TsMorphNode, type ExportDeclaration, type ImportDeclaration, type SourceFile } from 'ts-morph';
import type { LinkedBundle } from '../../linker/linked-bundle.ts';
import { resolvePublicModuleSourceFilePath } from '../../package-surface/modules.ts';
import { bindingId, type FileBindings } from '../reachability/reachability.ts';

export type CrossBundleInput = {
    readonly bundle: LinkedBundle;
    readonly sourceFiles: readonly Readonly<SourceFile>[];
    readonly fileBindings: readonly FileBindings[];
    readonly localReachable: ReadonlySet<string>;
};

export type SeedMap = ReadonlyMap<string, ReadonlySet<string>>;

type IndexedBundle = {
    readonly bundle: LinkedBundle;
    readonly bindingsByFilePath: ReadonlyMap<string, FileBindings>;
};

type ResolvedTarget = {
    readonly bundleName: string;
    readonly sourceFilePath: string;
    readonly indexedBundle: IndexedBundle;
};

type WalkContext = {
    readonly indexed: ReadonlyMap<string, IndexedBundle>;
    readonly seeds: Map<string, Set<string>>;
    readonly sourceFilePath: string;
    readonly localReachable: ReadonlySet<string>;
};

function indexBundles(inputs: readonly CrossBundleInput[]): ReadonlyMap<string, IndexedBundle> {
    const map = new Map<string, IndexedBundle>();
    for (const input of inputs) {
        const bindingsByFilePath = new Map<string, FileBindings>(
            input.fileBindings.map((file) => {
                return [file.sourceFilePath, file];
            })
        );
        map.set(input.bundle.name, { bundle: input.bundle, bindingsByFilePath });
    }
    return map;
}

function tryResolveAgainstBundle(indexedBundle: IndexedBundle, specifier: string): ResolvedTarget | undefined {
    const sourceFilePath = resolvePublicModuleSourceFilePath(indexedBundle.bundle, specifier);
    if (sourceFilePath === undefined) {
        return undefined;
    }
    return { bundleName: indexedBundle.bundle.name, sourceFilePath, indexedBundle };
}

function resolveCrossBundleTarget(
    specifier: string | undefined,
    indexed: ReadonlyMap<string, IndexedBundle>
): ResolvedTarget | undefined {
    if (specifier === undefined) {
        return undefined;
    }
    for (const info of indexed.values()) {
        const resolved = tryResolveAgainstBundle(info, specifier);
        if (resolved !== undefined) {
            return resolved;
        }
    }
    return undefined;
}

function recordSeed(seeds: Map<string, Set<string>>, bundleName: string, seed: string): void {
    const existing = seeds.get(bundleName) ?? new Set<string>();
    existing.add(seed);
    seeds.set(bundleName, existing);
}

function seedAllBindings(seeds: Map<string, Set<string>>, target: ResolvedTarget): void {
    const fileBindings = target.indexedBundle.bindingsByFilePath.get(target.sourceFilePath);
    if (fileBindings === undefined) {
        return;
    }
    for (const binding of fileBindings.bindings) {
        recordSeed(seeds, target.bundleName, bindingId(target.sourceFilePath, binding.name));
    }
}

function isLocalBindingReachable(context: WalkContext, localName: string): boolean {
    return context.localReachable.has(bindingId(context.sourceFilePath, localName));
}

function hasReachableDefaultImport(importDeclaration: ImportDeclaration, context: WalkContext): boolean {
    const defaultImport = importDeclaration.getDefaultImport();
    return defaultImport !== undefined && isLocalBindingReachable(context, defaultImport.getText());
}

function hasReachableNamespaceImport(importDeclaration: ImportDeclaration, context: WalkContext): boolean {
    const namespaceImport = importDeclaration.getNamespaceImport();
    return namespaceImport !== undefined && isLocalBindingReachable(context, namespaceImport.getText());
}

function hasReachableNamedImport(importDeclaration: ImportDeclaration, context: WalkContext): boolean {
    return importDeclaration.getNamedImports().some((namedImport) => {
        const localName = namedImport.getAliasNode()?.getText() ?? namedImport.getName();
        return isLocalBindingReachable(context, localName);
    });
}

function hasReachableImportedBinding(importDeclaration: ImportDeclaration, context: WalkContext): boolean {
    return (
        hasReachableDefaultImport(importDeclaration, context) ||
        hasReachableNamespaceImport(importDeclaration, context) ||
        hasReachableNamedImport(importDeclaration, context)
    );
}

function processImportDeclaration(importDeclaration: ImportDeclaration, context: WalkContext): void {
    const target = resolveCrossBundleTarget(importDeclaration.getModuleSpecifierValue(), context.indexed);
    if (target === undefined || !hasReachableImportedBinding(importDeclaration, context)) {
        return;
    }

    seedAllBindings(context.seeds, target);
}

function processExportDeclaration(exportDeclaration: ExportDeclaration, context: WalkContext): void {
    const target = resolveCrossBundleTarget(exportDeclaration.getModuleSpecifierValue(), context.indexed);
    if (target === undefined) {
        return;
    }
    seedAllBindings(context.seeds, target);
}

function walkCrossBundleStatements(sourceFile: Readonly<SourceFile>, context: WalkContext): void {
    for (const statement of sourceFile.getStatements()) {
        if (TsMorphNode.isImportDeclaration(statement)) {
            processImportDeclaration(statement, context);
        } else if (TsMorphNode.isExportDeclaration(statement)) {
            processExportDeclaration(statement, context);
        }
    }
}

export function buildCrossBundleSeeds(inputs: readonly CrossBundleInput[]): SeedMap {
    const indexed = indexBundles(inputs);
    const seeds = new Map<string, Set<string>>();
    for (const input of inputs) {
        for (const sourceFile of input.sourceFiles) {
            walkCrossBundleStatements(sourceFile, {
                indexed,
                seeds,
                sourceFilePath: sourceFile.getFilePath(),
                localReachable: input.localReachable
            });
        }
    }
    return seeds;
}
