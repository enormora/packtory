import type { DependencyScanner } from '../dependency-scanner/scanner.ts';
import {
    mergeExternalDependencyReference,
    type ExternalDependencies,
    type ExternalDependency,
    type NamedDependencySpecifierReference
} from '../dependency-scanner/external-dependencies.ts';
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
        substitutedInputFilePaths: ReadonlySet<string>
    ) => Promise<ResolvedBundle>;
};

const packageJsonIndentationSpaces = 4;

type BundleFileDescriptionInput = {
    readonly isGeneratedManifest?: true | undefined;
    readonly inputFilePath: string;
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
    inputFilePath: string
): Promise<string | undefined> {
    for (const candidate of declarationCompanionCandidates(inputFilePath)) {
        const readability = await fileManager.checkReadability(candidate);
        if (readability.isReadable) {
            return candidate;
        }
    }
    return undefined;
}

async function findReadableDeclarationCompanions(
    fileManager: Pick<FileManager, 'checkReadability'>,
    substitutedInputFilePaths: ReadonlySet<string>
): Promise<readonly string[]> {
    const companions: string[] = [];
    for (const inputFilePath of substitutedInputFilePaths) {
        const companion = await findReadableDeclarationCompanion(fileManager, inputFilePath);
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
            inputFilePath: bundleFile.inputFilePath,
            targetFilePath: bundleFile.targetFilePath
        };
    }

    return await fileManager.getTransferableFileDescriptionFromPath(
        bundleFile.inputFilePath,
        bundleFile.targetFilePath
    );
}

function targetPathByInputPath(resources: readonly ResolvedContent[]): ReadonlyMap<string, string> {
    return new Map(
        resources.map(function (resource) {
            return [ resource.fileDescription.inputFilePath, resource.fileDescription.targetFilePath ];
        })
    );
}

function targetFilePathFor(
    targetByInputPath: ReadonlyMap<string, string>,
    inputFilePath: string
): string {
    return targetByInputPath.get(inputFilePath) ?? inputFilePath;
}

function dependencySpecifierReferences(
    dependency: ExternalDependency
): readonly (NamedDependencySpecifierReference & { readonly targetFilePath: string; })[] {
    if (dependency.references !== undefined) {
        return dependency.references.map(function (reference) {
            return {
                name: dependency.name,
                targetFilePath: reference.targetFilePath,
                sourceSpecifier: reference.sourceSpecifier,
                emittedSpecifier: reference.emittedSpecifier
            };
        });
    }
    return dependency.referencedFrom.map(function (targetFilePath) {
        return {
            name: dependency.name,
            targetFilePath,
            sourceSpecifier: dependency.name,
            emittedSpecifier: dependency.name
        };
    });
}

function externalDependenciesWithTargetPaths(
    dependencies: ExternalDependencies,
    targetByInputPath: ReadonlyMap<string, string>
): ExternalDependencies {
    const dependenciesByName = new Map<string, ExternalDependency>();
    for (const dependency of dependencies.values()) {
        for (const reference of dependencySpecifierReferences(dependency)) {
            const existing = dependenciesByName.get(reference.name);
            dependenciesByName.set(
                reference.name,
                mergeExternalDependencyReference(
                    {
                        name: reference.name,
                        sourceSpecifier: reference.sourceSpecifier,
                        emittedSpecifier: reference.emittedSpecifier
                    },
                    targetFilePathFor(targetByInputPath, reference.targetFilePath),
                    existing
                )
            );
        }
    }
    return dependenciesByName;
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
                    moduleReferences: bundleFile.moduleReferences,
                    project: bundleFile.project,
                    isExplicitlyIncluded: bundleFile.isExplicitlyIncluded,
                    ...bundleFile.isGeneratedManifest ? { isGeneratedManifest: true } : {}
                };
            })
        );

        const targetByInputPath = targetPathByInputPath(contents);
        return {
            contents,
            name: options.name,
            exportPackageJson: options.exportPackageJson,
            surface: normalized.surface,
            externalDependencies: externalDependenciesWithTargetPaths(
                resolvedDependencies.externalDependencies,
                targetByInputPath
            ),
            roots: buildResolvedRoots(normalized, contents)
        };
    }

    return {
        async resolve(options) {
            return await resolveWithPromotedDeclarations(options, []);
        },

        resolveWithPromotedDeclarations,

        async resolveWithPromotedDeclarationCompanions(options, substitutedInputFilePaths) {
            const promotedDeclarationEntryFiles = hasDeclarationRoots(options)
                ? await findReadableDeclarationCompanions(fileManager, substitutedInputFilePaths)
                : [];
            return await resolveWithPromotedDeclarations(options, promotedDeclarationEntryFiles);
        }
    };
}
