import { map } from 'effect/ReadonlyArray';
import type { DependencyScanner } from '../dependency-scanner/scanner.js';
import { type DependencyFiles, mergeDependencyFiles } from '../dependency-scanner/dependency-graph.js';
import type { FileManager } from '../file-manager/file-manager.js';
import type { TransferableFileDescription } from '../file-manager/file-description.js';
import type { BundleResource, ResolvedBundle, ResolvedContent } from './resolved-bundle.js';
import type { ResourceResolveOptions } from './resource-resolve-options.js';
import { combineAllBundleFiles } from './content.js';

export type ResourceResolverDependencies = {
    readonly dependencyScanner: DependencyScanner;
    readonly fileManager: FileManager;
};

export type ResourceResolver = {
    resolve(options: ResourceResolveOptions): Promise<ResolvedBundle>;
};

export function createResourceResolver(dependencies: ResourceResolverDependencies): ResourceResolver {
    const { dependencyScanner, fileManager } = dependencies;

    async function resolveDependenciesForAllEntrypoints(options: ResourceResolveOptions): Promise<DependencyFiles> {
        const { entryPoints, sourcesFolder, includeSourceMapFiles, moduleResolution } = options;
        let dependencyFiles: DependencyFiles = { externalDependencies: new Map(), localFiles: [] };

        for (const entryPoint of entryPoints) {
            const jsDependencyGraph = await dependencyScanner.scan(entryPoint.js, sourcesFolder, {
                includeSourceMapFiles,
                resolveDeclarationFiles: false,
                moduleResolution
            });
            dependencyFiles = mergeDependencyFiles(dependencyFiles, jsDependencyGraph.flatten(entryPoint.js));

            if (entryPoint.declarationFile !== undefined) {
                const declarationDependencyGraph = await dependencyScanner.scan(
                    entryPoint.declarationFile,
                    sourcesFolder,
                    {
                        includeSourceMapFiles,
                        resolveDeclarationFiles: true,
                        moduleResolution
                    }
                );
                dependencyFiles = mergeDependencyFiles(
                    dependencyFiles,
                    declarationDependencyGraph.flatten(entryPoint.declarationFile)
                );
            }
        }

        return dependencyFiles;
    }

    function findFileDescriptionBySourcePath(
        filePath: string,
        resources: BundleResource[]
    ): TransferableFileDescription | undefined {
        const matchingResource = resources.find((resource) => {
            return resource.fileDescription.sourceFilePath === filePath;
        });

        if (matchingResource === undefined) {
            return undefined;
        }

        return matchingResource.fileDescription;
    }

    return {
        async resolve(options) {
            const resolvedDependencies = await resolveDependenciesForAllEntrypoints(options);

            const bundleFiles = combineAllBundleFiles(
                options.sourcesFolder,
                resolvedDependencies.localFiles,
                options.additionalFiles
            );

            const contents = await Promise.all(
                bundleFiles.map(async (bundleFile): Promise<ResolvedContent> => {
                    const fileDescription = await fileManager.getTransferableFileDescriptionFromPath(
                        bundleFile.sourceFilePath,
                        bundleFile.targetFilePath
                    );

                    return {
                        fileDescription,
                        directDependencies: bundleFile.directDependencies,
                        project: bundleFile.project
                    };
                })
            );

            return {
                contents,
                name: options.name,
                externalDependencies: resolvedDependencies.externalDependencies,
                entryPoints: map(options.entryPoints, (entryPoint) => {
                    const jsResource = findFileDescriptionBySourcePath(entryPoint.js, contents);
                    if (jsResource === undefined) {
                        throw new Error(`Failed to resolve resource for entry point ${entryPoint.js}`);
                    }

                    const declarationFileResource =
                        entryPoint.declarationFile === undefined
                            ? undefined
                            : findFileDescriptionBySourcePath(entryPoint.declarationFile, contents);

                    return { js: jsResource, declarationFile: declarationFileResource };
                })
            };
        }
    };
}
