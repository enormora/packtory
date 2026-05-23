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

const packageJsonIndentationSpaces = 4;

function serializeVirtualManifest(mainPackageJson: ResourceResolveOptions['mainPackageJson']): string {
    return `${JSON.stringify(mainPackageJson, null, packageJsonIndentationSpaces)}\n`;
}

async function resolveFileDescription(
    fileManager: FileManager,
    bundleFile: {
        readonly isGeneratedManifest?: true | undefined;
        readonly sourceFilePath: string;
        readonly targetFilePath: string;
    },
    mainPackageJson: ResourceResolveOptions['mainPackageJson']
): Promise<ResolvedContent['fileDescription']> {
    if (bundleFile.isGeneratedManifest) {
        return {
            content: serializeVirtualManifest(mainPackageJson),
            isExecutable: false,
            sourceFilePath: bundleFile.sourceFilePath,
            targetFilePath: bundleFile.targetFilePath
        };
    }

    return await fileManager.getTransferableFileDescriptionFromPath(
        bundleFile.sourceFilePath,
        bundleFile.targetFilePath
    );
}

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
                    const fileDescription = await resolveFileDescription(
                        fileManager,
                        bundleFile,
                        options.mainPackageJson
                    );

                    return {
                        fileDescription,
                        directDependencies: bundleFile.directDependencies,
                        project: bundleFile.project,
                        isExplicitlyIncluded: bundleFile.isExplicitlyIncluded,
                        ...(bundleFile.isGeneratedManifest ? { isGeneratedManifest: true } : {})
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
