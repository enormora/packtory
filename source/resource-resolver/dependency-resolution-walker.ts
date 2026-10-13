import { mergeDependencyFiles, type DependencyFiles } from '../dependency-scanner/dependency-graph.ts';
import type { DependencyScanner } from '../dependency-scanner/scanner.ts';
import type { FileManager } from '../file-manager/file-manager.ts';
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
    readonly scannedDeclarationFiles: DeclarationScanTracker;
};

function emptyDependencyFiles(): DependencyFiles {
    return { externalDependencies: new Map(), localFiles: [] };
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
            mainPackageManifest: options.mainPackageManifest
        }
    );
    return pendingEntryFiles.reduce(function (result, entryFile) {
        return mergeDependencyFiles(result, declarationDependencyGraph.flatten(entryFile));
    }, emptyDependencyFiles());
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

async function resolveJavaScriptDependencies(
    context: RootResolutionContext,
    root: ResolvedRootsAndSurface['roots'][string]
): Promise<DependencyFiles> {
    const { dependencies, options } = context;
    const { sourcesFolder, includeSourceMapFiles, mainPackageManifest } = options;
    const javaScriptDependencyGraph = await dependencies.dependencyScanner.scan(root.javaScript, sourcesFolder, {
        includeSourceMapFiles,
        resolveDeclarationFiles: false,
        mainPackageManifest
    });
    return javaScriptDependencyGraph.flatten(root.javaScript);
}

async function resolveRootDeclarationDependencies(
    context: RootResolutionContext,
    root: ResolvedRootsAndSurface['roots'][string]
): Promise<DependencyFiles> {
    const entryFiles: string[] = [];
    if (root.declarationFile !== undefined) {
        entryFiles.push(root.declarationFile);
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
    const javaScriptDependencies = await resolveJavaScriptDependencies(context, root);
    const declarationDependencies = await resolveRootDeclarationDependencies(context, root);
    return mergeDependencyFiles(javaScriptDependencies, declarationDependencies);
}

export async function resolveDependenciesForAllRoots(
    dependencies: DependencyResolutionDependencies,
    options: ResourceResolveOptions,
    promotedDeclarationEntryFiles: readonly string[]
): Promise<DependencyFiles> {
    const { roots } = resolveRootsAndSurface(options);
    const rootValues = Object.values(roots);
    const context: RootResolutionContext = {
        dependencies,
        options,
        scannedDeclarationFiles: createDeclarationScanTracker()
    };
    let dependencyFiles = emptyDependencyFiles();

    for (const root of rootValues) {
        dependencyFiles = mergeDependencyFiles(dependencyFiles, await resolveDependenciesForRoot(context, root));
    }

    const promotedDeclarationDependencies = await scanDeclarationGraph(
        dependencies,
        options,
        promotedDeclarationEntryFiles,
        context.scannedDeclarationFiles
    );

    dependencyFiles = mergeDependencyFiles(dependencyFiles, promotedDeclarationDependencies);

    return dependencyFiles;
}
