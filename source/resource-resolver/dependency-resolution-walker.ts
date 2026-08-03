import { mergeDependencyFiles, type DependencyFiles } from '../dependency-scanner/dependency-graph.ts';
import type { DependencyScanner } from '../dependency-scanner/scanner.ts';
import type { FileManager } from '../file-manager/file-manager.ts';
import { declarationCompanionCandidates } from '../common/declaration-companion-paths.ts';
import {
    type ResolvedRootsAndSurface,
    resolveRootsAndSurface,
    type ResourceResolveOptions
} from './resource-resolve-options.ts';

type DependencyResolutionDependencies = {
    readonly dependencyScanner: DependencyScanner;
    readonly fileManager: Pick<FileManager, 'checkReadability'>;
};

type DeclarationScanTracker = {
    readonly has: (filePath: string) => boolean;
    readonly record: (filePath: string) => void;
};
type RootResolutionContext = {
    readonly dependencies: DependencyResolutionDependencies;
    readonly options: ResourceResolveOptions;
    readonly packageHasDeclarationRoots: boolean;
    readonly rootJsSourceFilePaths: ReadonlySet<string>;
    readonly scannedDeclarationFiles: DeclarationScanTracker;
};

function emptyDependencyFiles(): DependencyFiles {
    return { externalDependencies: new Map(), localFiles: [] };
}

async function findReadableDeclarationCompanion(
    fileManager: Pick<FileManager, 'checkReadability'>,
    filePath: string
): Promise<string | undefined> {
    for (const candidate of declarationCompanionCandidates(filePath)) {
        const readability = await fileManager.checkReadability(candidate);
        if (readability.isReadable) {
            return candidate;
        }
    }

    return undefined;
}

async function scanDeclarationGraph(
    dependencies: DependencyResolutionDependencies,
    options: ResourceResolveOptions,
    entryFiles: readonly string[],
    scannedDeclarationFiles: DeclarationScanTracker
): Promise<DependencyFiles> {
    const pendingEntryFiles = entryFiles.filter(function (entryFile) {
        return !scannedDeclarationFiles.has(entryFile);
    });
    if (pendingEntryFiles.length === 0) {
        return emptyDependencyFiles();
    }
    pendingEntryFiles.forEach(function (entryFile) {
        scannedDeclarationFiles.record(entryFile);
    });

    const declarationDependencyGraph = await dependencies.dependencyScanner.scanEntries(
        pendingEntryFiles,
        options.sourcesFolder,
        {
            includeSourceMapFiles: options.includeSourceMapFiles,
            resolveDeclarationFiles: true,
            mainPackageJson: options.mainPackageJson
        }
    );
    return pendingEntryFiles.reduce(function (result, entryFile) {
        return mergeDependencyFiles(result, declarationDependencyGraph.flatten(entryFile));
    }, emptyDependencyFiles());
}

async function collectDeclarationCompanionEntries(
    context: RootResolutionContext,
    jsDependencies: DependencyFiles
): Promise<readonly string[]> {
    const companions: string[] = [];
    const nonRootLocalFiles = jsDependencies.localFiles.filter(function (localFile) {
        return !context.rootJsSourceFilePaths.has(localFile.filePath);
    });
    for (const localFile of nonRootLocalFiles) {
        const declarationCompanion = await findReadableDeclarationCompanion(
            context.dependencies.fileManager,
            localFile.filePath
        );
        if (declarationCompanion !== undefined) {
            companions.push(declarationCompanion);
        }
    }

    return companions;
}

function createDeclarationScanTracker(): DeclarationScanTracker {
    const scannedDeclarationFiles = new Set<string>();
    return {
        has(filePath) {
            return scannedDeclarationFiles.has(filePath);
        },
        record(filePath) {
            scannedDeclarationFiles.add(filePath);
        }
    };
}

async function resolveJsDependencies(
    context: RootResolutionContext,
    root: ResolvedRootsAndSurface['roots'][string]
): Promise<DependencyFiles> {
    const { dependencies, options } = context;
    const { sourcesFolder, includeSourceMapFiles, mainPackageJson } = options;
    const jsDependencyGraph = await dependencies.dependencyScanner.scan(root.js, sourcesFolder, {
        includeSourceMapFiles,
        resolveDeclarationFiles: false,
        mainPackageJson
    });
    return jsDependencyGraph.flatten(root.js);
}

async function resolveRootDeclarationDependencies(
    context: RootResolutionContext,
    root: ResolvedRootsAndSurface['roots'][string],
    jsDependencies: DependencyFiles
): Promise<DependencyFiles> {
    const entryFiles: string[] = [];
    if (root.declarationFile !== undefined) {
        entryFiles.push(root.declarationFile);
    }
    if (context.packageHasDeclarationRoots) {
        entryFiles.push(...await collectDeclarationCompanionEntries(context, jsDependencies));
    }
    return scanDeclarationGraph(
        context.dependencies,
        context.options,
        entryFiles,
        context.scannedDeclarationFiles
    );
}

async function resolveDependenciesForRoot(
    context: RootResolutionContext,
    root: ResolvedRootsAndSurface['roots'][string]
): Promise<DependencyFiles> {
    const jsDependencies = await resolveJsDependencies(context, root);
    const declarationDependencies = await resolveRootDeclarationDependencies(context, root, jsDependencies);
    return mergeDependencyFiles(jsDependencies, declarationDependencies);
}

export async function resolveDependenciesForAllRoots(
    dependencies: DependencyResolutionDependencies,
    options: ResourceResolveOptions
): Promise<DependencyFiles> {
    const { roots } = resolveRootsAndSurface(options);
    const rootValues = Object.values(roots);
    const context: RootResolutionContext = {
        dependencies,
        options,
        packageHasDeclarationRoots: rootValues.some(function (root) {
            return root.declarationFile !== undefined;
        }),
        rootJsSourceFilePaths: new Set(rootValues.map(function (root) {
            return root.js;
        })),
        scannedDeclarationFiles: createDeclarationScanTracker()
    };
    let dependencyFiles = emptyDependencyFiles();

    for (const root of rootValues) {
        dependencyFiles = mergeDependencyFiles(dependencyFiles, await resolveDependenciesForRoot(context, root));
    }

    return dependencyFiles;
}
