import type { DependencyScanner } from '../dependency-scanner/scanner.ts';
import type { FileManager } from '../file-manager/file-manager.ts';
import { declarationCompanionCandidates } from '../common/declaration-companion-paths.ts';
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
    resolveWithPromotedDeclarations: (
        options: ResourceResolveOptions,
        promotedDeclarationEntryFiles: readonly string[]
    ) => Promise<ResolvedBundle>;
    resolveWithPromotedDeclarationCompanions: (
        options: ResourceResolveOptions,
        substitutedSourceFilePaths: ReadonlySet<string>
    ) => Promise<ResolvedBundle>;
};

const packageJsonIndentationSpaces = 4;

type BundleFileDescriptionInput = {
    readonly isGeneratedManifest?: true | undefined;
    readonly sourceFilePath: string;
    readonly targetFilePath: string;
};

function serializeVirtualManifest(mainPackageJson: ResourceResolveOptions['mainPackageJson']): string {
    return `${JSON.stringify(mainPackageJson, null, packageJsonIndentationSpaces)}\n`;
}

function hasDeclarationRoots(options: ResourceResolveOptions): boolean {
    const normalized = resolveRootsAndSurface(options);
    return Object.values(normalized.roots).some(function (root) {
        return root.declarationFile !== undefined;
    });
}

async function findReadableDeclarationCompanion(
    fileManager: Pick<FileManager, 'checkReadability'>,
    sourceFilePath: string
): Promise<string | undefined> {
    for (const candidate of declarationCompanionCandidates(sourceFilePath)) {
        const readability = await fileManager.checkReadability(candidate);
        if (readability.isReadable) {
            return candidate;
        }
    }
    return undefined;
}

async function findReadableDeclarationCompanions(
    fileManager: Pick<FileManager, 'checkReadability'>,
    substitutedSourceFilePaths: ReadonlySet<string>
): Promise<readonly string[]> {
    const companions: string[] = [];
    for (const sourceFilePath of substitutedSourceFilePaths) {
        const companion = await findReadableDeclarationCompanion(fileManager, sourceFilePath);
        if (companion !== undefined) {
            companions.push(companion);
        }
    }
    return companions;
}

async function resolveFileDescription(
    fileManager: FileManager,
    bundleFile: BundleFileDescriptionInput,
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

    async function resolveWithPromotedDeclarations(
        options: ResourceResolveOptions,
        promotedDeclarationEntryFiles: readonly string[]
    ): Promise<ResolvedBundle> {
        const normalized = resolveRootsAndSurface(options);
        const resolvedDependencies = await resolveDependenciesForAllRoots(
            { dependencyScanner, fileManager },
            options,
            promotedDeclarationEntryFiles
        );

        const bundleFiles = combineAllBundleFiles(
            options.sourcesFolder,
            resolvedDependencies.localFiles,
            options.additionalFiles
        );

        const contents = await Promise.all(
            bundleFiles.map(async function (bundleFile): Promise<ResolvedContent> {
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
                    ...bundleFile.isGeneratedManifest ? { isGeneratedManifest: true } : {}
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

    return {
        async resolve(options) {
            return await resolveWithPromotedDeclarations(options, []);
        },

        resolveWithPromotedDeclarations,

        async resolveWithPromotedDeclarationCompanions(options, substitutedSourceFilePaths) {
            const promotedDeclarationEntryFiles = hasDeclarationRoots(options)
                ? await findReadableDeclarationCompanions(fileManager, substitutedSourceFilePaths)
                : [];
            return await resolveWithPromotedDeclarations(options, promotedDeclarationEntryFiles);
        }
    };
}
