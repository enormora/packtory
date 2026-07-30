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
    entryFile: string,
    scannedDeclarationFiles: DeclarationScanTracker
): Promise<DependencyFiles> {
    if (scannedDeclarationFiles.has(entryFile)) {
        return emptyDependencyFiles();
    }
    scannedDeclarationFiles.record(entryFile);

    const declarationDependencyGraph = await dependencies.dependencyScanner.scan(entryFile, options.sourcesFolder, {
        includeSourceMapFiles: options.includeSourceMapFiles,
        resolveDeclarationFiles: true,
        mainPackageJson: options.mainPackageJson
    });
    return declarationDependencyGraph.flatten(entryFile);
}

async function resolveDeclarationCompanionDependencies(
    context: RootResolutionContext,
    jsDependencies: DependencyFiles
): Promise<DependencyFiles> {
    let result = emptyDependencyFiles();
    const nonRootLocalFiles = jsDependencies.localFiles.filter(function (localFile) {
        return !context.rootJsSourceFilePaths.has(localFile.filePath);
    });
    for (const localFile of nonRootLocalFiles) {
        const declarationCompanion = await findReadableDeclarationCompanion(
            context.dependencies.fileManager,
            localFile.filePath
        );
        if (declarationCompanion !== undefined) {
            result = mergeDependencyFiles(
                result,
                await scanDeclarationGraph(
                    context.dependencies,
                    context.options,
                    declarationCompanion,
                    context.scannedDeclarationFiles
                )
            );
        }
    }

    return result;
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
    root: ResolvedRootsAndSurface['roots'][string]
): Promise<DependencyFiles> {
    if (root.declarationFile !== undefined) {
        return await scanDeclarationGraph(
            context.dependencies,
            context.options,
            root.declarationFile,
            context.scannedDeclarationFiles
        );
    }

    return emptyDependencyFiles();
}

async function resolveDependenciesForRoot(
    context: RootResolutionContext,
    root: ResolvedRootsAndSurface['roots'][string]
): Promise<DependencyFiles> {
    const jsDependencies = await resolveJsDependencies(context, root);
    const declarationDependencies = await resolveRootDeclarationDependencies(context, root);
    let dependencyFiles = mergeDependencyFiles(jsDependencies, declarationDependencies);

    if (context.packageHasDeclarationRoots) {
        dependencyFiles = mergeDependencyFiles(
            dependencyFiles,
            await resolveDeclarationCompanionDependencies(context, jsDependencies)
        );
    }

    return dependencyFiles;
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
