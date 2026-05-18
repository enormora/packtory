import { mergeDependencyFiles, type DependencyFiles } from '../dependency-scanner/dependency-graph.ts';
import type { DependencyScanner } from '../dependency-scanner/scanner.ts';
import { resolveRootsAndSurface, type ResourceResolveOptions } from './resource-resolve-options.ts';

export async function resolveDependenciesForAllRoots(
    dependencyScanner: DependencyScanner,
    options: ResourceResolveOptions
): Promise<DependencyFiles> {
    const { roots } = resolveRootsAndSurface(options);
    const { sourcesFolder, includeSourceMapFiles, mainPackageJson } = options;
    let dependencyFiles: DependencyFiles = { externalDependencies: new Map(), localFiles: [] };

    for (const root of Object.values(roots)) {
        const jsDependencyGraph = await dependencyScanner.scan(root.js, sourcesFolder, {
            includeSourceMapFiles,
            resolveDeclarationFiles: false,
            mainPackageJson
        });
        dependencyFiles = mergeDependencyFiles(dependencyFiles, jsDependencyGraph.flatten(root.js));

        if (root.declarationFile !== undefined) {
            const declarationDependencyGraph = await dependencyScanner.scan(root.declarationFile, sourcesFolder, {
                includeSourceMapFiles,
                resolveDeclarationFiles: true,
                mainPackageJson
            });
            dependencyFiles = mergeDependencyFiles(
                dependencyFiles,
                declarationDependencyGraph.flatten(root.declarationFile)
            );
        }
    }

    return dependencyFiles;
}
