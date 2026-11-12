import { mergeDependencyFiles, type DependencyFiles } from '../dependency-scanner/dependency-graph.ts';
import type { DependencyScanner } from '../dependency-scanner/scanner.ts';
import type { FileManager } from '../file-manager/file-manager.ts';
import { resolveRootsAndSurface, type ResourceResolveOptions } from './resource-resolve-options.ts';

type DependencyResolutionDependencies = {
    readonly dependencyScanner: DependencyScanner;
    readonly fileManager: Pick<FileManager, 'checkReadability'>;
};

function emptyDependencyFiles(): DependencyFiles {
    return { externalDependencies: new Map(), localFiles: [] };
}

async function scanRootFiles(
    dependencies: DependencyResolutionDependencies,
    options: ResourceResolveOptions,
    entries: readonly string[],
    resolveDeclarationFiles: boolean
): Promise<DependencyFiles> {
    const uniqueEntries = Array.from(new Set(entries));
    if (uniqueEntries.length === 0) {
        return emptyDependencyFiles();
    }
    const graph = await dependencies.dependencyScanner.scanEntries(uniqueEntries, options.sourcesFolder, {
        includeSourceMapFiles: options.includeSourceMapFiles,
        resolveDeclarationFiles,
        mainPackageManifest: options.mainPackageManifest
    });
    return uniqueEntries.reduce(function (files, entry) {
        return mergeDependencyFiles(files, graph.flatten(entry));
    }, emptyDependencyFiles());
}

function jsonRootFiles(roots: ResourceResolveOptions['roots']): DependencyFiles {
    const localFiles = Object.values(roots).flatMap(function (root) {
        if (root.json === undefined) {
            return [];
        }
        if (!root.json.endsWith('.json')) {
            throw new Error('JSON roots must use the .json extension');
        }
        return [ { filePath: root.json, directDependencies: new Set<string>(), moduleReferences: [] } ];
    });
    return { externalDependencies: new Map(), localFiles };
}

export async function resolveDependenciesForAllRoots(
    dependencies: DependencyResolutionDependencies,
    options: ResourceResolveOptions,
    promotedDeclarationEntryFiles: readonly string[]
): Promise<DependencyFiles> {
    const { roots } = resolveRootsAndSurface(options);
    const jsonFiles = jsonRootFiles(roots);
    const runtimeFiles = await scanRootFiles(
        dependencies,
        options,
        Object.values(roots).flatMap(function (root) {
            return root.javaScript === undefined ? [] : [ root.javaScript ];
        }),
        false
    );
    const declarationFiles = await scanRootFiles(dependencies, options, [
        ...Object.values(roots).flatMap(function (root) {
            return root.declarationFile === undefined ? [] : [ root.declarationFile ];
        }),
        ...promotedDeclarationEntryFiles
    ], true);
    return mergeDependencyFiles(mergeDependencyFiles(jsonFiles, runtimeFiles), declarationFiles);
}
