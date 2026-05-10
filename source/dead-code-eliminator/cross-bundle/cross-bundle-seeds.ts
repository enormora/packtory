import { Node as TsMorphNode, type ImportDeclaration, type SourceFile } from 'ts-morph';
import type { LinkedBundle } from '../../linker/linked-bundle.ts';
import { bindingId, type FileBindings } from '../reachability/reachability.ts';

export type CrossBundleInput = {
    readonly bundle: LinkedBundle;
    readonly sourceFiles: readonly Readonly<SourceFile>[];
    readonly fileBindings: readonly FileBindings[];
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

function findResourceByTargetPath(bundle: LinkedBundle, targetFilePath: string): string | undefined {
    const resource = bundle.contents.find((entry) => {
        return entry.fileDescription.targetFilePath === targetFilePath;
    });
    return resource?.fileDescription.sourceFilePath;
}

function tryResolveAgainstBundle(
    bundleName: string,
    indexedBundle: IndexedBundle,
    specifier: string
): ResolvedTarget | undefined {
    const prefix = `${bundleName}/`;
    if (!specifier.startsWith(prefix)) {
        return undefined;
    }
    const targetPath = specifier.slice(prefix.length);
    const sourceFilePath = findResourceByTargetPath(indexedBundle.bundle, targetPath);
    if (sourceFilePath === undefined) {
        return undefined;
    }
    return { bundleName, sourceFilePath, indexedBundle };
}

function resolveCrossBundleTarget(
    importDeclaration: ImportDeclaration,
    indexed: ReadonlyMap<string, IndexedBundle>
): ResolvedTarget | undefined {
    const specifier = importDeclaration.getModuleSpecifierValue();
    for (const [bundleName, info] of indexed) {
        const resolved = tryResolveAgainstBundle(bundleName, info, specifier);
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

function recordDefaultImportSeed(
    importDeclaration: ImportDeclaration,
    target: ResolvedTarget,
    seeds: Map<string, Set<string>>
): void {
    if (importDeclaration.getDefaultImport() === undefined) {
        return;
    }
    recordSeed(seeds, target.bundleName, bindingId(target.sourceFilePath, 'default'));
}

function recordNamedImportSeeds(
    importDeclaration: ImportDeclaration,
    target: ResolvedTarget,
    seeds: Map<string, Set<string>>
): void {
    for (const namedImport of importDeclaration.getNamedImports()) {
        recordSeed(seeds, target.bundleName, bindingId(target.sourceFilePath, namedImport.getName()));
    }
}

function processImportDeclaration(
    importDeclaration: ImportDeclaration,
    indexed: ReadonlyMap<string, IndexedBundle>,
    seeds: Map<string, Set<string>>
): void {
    const target = resolveCrossBundleTarget(importDeclaration, indexed);
    if (target === undefined) {
        return;
    }
    if (importDeclaration.getNamespaceImport() !== undefined) {
        seedAllBindings(seeds, target);
        return;
    }
    recordDefaultImportSeed(importDeclaration, target, seeds);
    recordNamedImportSeeds(importDeclaration, target, seeds);
}

function walkImportsInSourceFile(
    sourceFile: Readonly<SourceFile>,
    indexed: ReadonlyMap<string, IndexedBundle>,
    seeds: Map<string, Set<string>>
): void {
    for (const statement of sourceFile.getStatements()) {
        if (TsMorphNode.isImportDeclaration(statement)) {
            processImportDeclaration(statement, indexed, seeds);
        }
    }
}

export function buildCrossBundleSeeds(inputs: readonly CrossBundleInput[]): SeedMap {
    const indexed = indexBundles(inputs);
    const seeds = new Map<string, Set<string>>();
    for (const input of inputs) {
        for (const sourceFile of input.sourceFiles) {
            walkImportsInSourceFile(sourceFile, indexed, seeds);
        }
    }
    return seeds;
}
