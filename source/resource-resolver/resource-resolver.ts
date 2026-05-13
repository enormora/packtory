import type { DependencyScanner } from '../dependency-scanner/scanner.ts';
import { type DependencyFiles, mergeDependencyFiles } from '../dependency-scanner/dependency-graph.ts';
import type { FileManager } from '../file-manager/file-manager.ts';
import type { TransferableFileDescription } from '../file-manager/file-description.ts';
import type { BundleResource, ResolvedBundle, ResolvedContent } from './resolved-bundle.ts';
import { resolveRootsAndSurface, type ResourceResolveOptions } from './resource-resolve-options.ts';
import { combineAllBundleFiles } from './content.ts';

export type ResourceResolverDependencies = {
    readonly dependencyScanner: DependencyScanner;
    readonly fileManager: FileManager;
};

export type ResourceResolver = {
    resolve: (options: ResourceResolveOptions) => Promise<ResolvedBundle>;
};

export function createResourceResolver(dependencies: ResourceResolverDependencies): ResourceResolver {
    const { dependencyScanner, fileManager } = dependencies;

    async function resolveDependenciesForAllRoots(options: ResourceResolveOptions): Promise<DependencyFiles> {
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

    function requireFileDescriptionBySourcePath(
        filePath: string,
        resources: BundleResource[]
    ): TransferableFileDescription {
        const fileDescription = findFileDescriptionBySourcePath(filePath, resources);
        if (fileDescription === undefined) {
            throw new Error(`Failed to resolve resource for root ${filePath}`);
        }

        return fileDescription;
    }

    function resolveDeclarationFileResource(
        declarationFilePath: string | undefined,
        contents: BundleResource[]
    ): TransferableFileDescription | undefined {
        return contents.find((resource) => {
            return resource.fileDescription.sourceFilePath === declarationFilePath;
        })?.fileDescription;
    }

    function buildResolvedRootFileDescription(
        js: TransferableFileDescription,
        declarationFile: TransferableFileDescription | undefined
    ): { js: TransferableFileDescription; declarationFile: TransferableFileDescription | undefined } {
        return { js, declarationFile };
    }

    function buildResolvedRoots(
        normalized: ReturnType<typeof resolveRootsAndSurface>,
        contents: BundleResource[]
    ): ResolvedBundle['roots'] {
        const resolvedRoots: Record<
            string,
            { js: TransferableFileDescription; declarationFile: TransferableFileDescription | undefined }
        > = {};
        for (const [rootId, root] of Object.entries(normalized.roots)) {
            const jsResource = requireFileDescriptionBySourcePath(root.js, contents);
            const declarationFile = resolveDeclarationFileResource(root.declarationFile, contents);
            resolvedRoots[rootId] = buildResolvedRootFileDescription(jsResource, declarationFile);
        }

        return resolvedRoots;
    }

    function buildResolvedEntryPoints(
        normalized: ReturnType<typeof resolveRootsAndSurface>,
        contents: BundleResource[]
    ): ResolvedBundle['entryPoints'] {
        const buildEntryPoint = (
            root: ReturnType<typeof resolveRootsAndSurface>['entryPoints'][number]
        ): {
            js: TransferableFileDescription;
            declarationFile: TransferableFileDescription | undefined;
        } => {
            const jsResource = requireFileDescriptionBySourcePath(root.js, contents);
            const declarationFile = resolveDeclarationFileResource(root.declarationFile, contents);
            return { js: jsResource, declarationFile };
        };
        const [firstEntryPoint, ...remainingEntryPoints] = normalized.entryPoints;
        const result: [ReturnType<typeof buildEntryPoint>, ...ReturnType<typeof buildEntryPoint>[]] = [
            buildEntryPoint(firstEntryPoint)
        ];
        for (const root of remainingEntryPoints) {
            result.push(buildEntryPoint(root));
        }

        return result;
    }

    return {
        async resolve(options) {
            const normalized = resolveRootsAndSurface(options);
            const resolvedDependencies = await resolveDependenciesForAllRoots(options);

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
                        project: bundleFile.project,
                        isExplicitlyIncluded: bundleFile.isExplicitlyIncluded
                    };
                })
            );

            return {
                contents,
                name: options.name,
                surface: normalized.surface,
                externalDependencies: resolvedDependencies.externalDependencies,
                roots: buildResolvedRoots(normalized, contents),
                entryPoints: buildResolvedEntryPoints(normalized, contents)
            };
        }
    };
}
