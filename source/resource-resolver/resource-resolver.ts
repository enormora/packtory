import type { DependencyScanner } from '../dependency-scanner/scanner.ts';
import type { FileManager } from '../file-manager/file-manager.ts';
import { combineAllBundleFiles } from './content.ts';
import { buildResolvedRoots } from './bundle-resource-lookup.ts';
import { resolveDependenciesForAllRoots } from './dependency-resolution-walker.ts';
import type { ResolvedBundle, ResolvedContent } from './resolved-bundle.ts';
import { resolveRootsAndSurface, type ResourceResolveOptions } from './resource-resolve-options.ts';

export type ResourceResolverDependencies = {
    readonly dependencyScanner: DependencyScanner;
    readonly fileManager: FileManager;
};

export type ResourceResolver = {
    resolve: (options: ResourceResolveOptions) => Promise<ResolvedBundle>;
};

export function createResourceResolver(dependencies: ResourceResolverDependencies): ResourceResolver {
    const { dependencyScanner, fileManager } = dependencies;

    return {
        async resolve(options) {
            const normalized = resolveRootsAndSurface(options);
            const resolvedDependencies = await resolveDependenciesForAllRoots(dependencyScanner, options);

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
                exportPackageJson: options.exportPackageJson,
                surface: normalized.surface,
                externalDependencies: resolvedDependencies.externalDependencies,
                roots: buildResolvedRoots(normalized, contents)
            };
        }
    };
}
