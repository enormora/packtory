import type { ts as typescript } from 'ts-morph';
import {
    declarationCompanionCandidates,
    isDeclarationCompanionFilePath
} from '../common/declaration-companion-paths.ts';
import { breadthFirstClosure } from '../dead-code-eliminator/reachability/breadth-first-closure.ts';
import type { ExplicitPackageSurface, ImplicitPackageSurface } from '../package-surface/surface.ts';
import {
    indexPublicModules,
    rootInputFilePaths
} from '../package-surface/package-surface-index.ts';
import { getRoot } from '../package-surface/root-registry.ts';
import { toPackageSpecifier, toRootPackageSpecifier } from '../package-surface/specifier-syntax.ts';
import type { BundleSubstitutionSource } from './linked-bundle.ts';
import {
    createSubstitutionSourceIndex,
    namedExports,
    type SubstitutionSourceIndex
} from './substitution-source-index.ts';

export type ImportPathReplacement = {
    readonly emittedSpecifier: string;
    readonly packageName: string;
};

export type ImportPathReplacementRequest = {
    readonly inputFilePath: string;
    readonly requiredExportNames: ReadonlySet<string>;
    readonly requiresNamespaceExport: boolean;
};

export type Replacements = {
    readonly importPathReplacements: ReadonlyMap<string, ImportPathReplacement>;
    readonly bundleDependencies: readonly string[];
    readonly substitutedInputFilePathsByPackageName: ReadonlyMap<string, ReadonlySet<string>>;
};

type ReplacementMatch = {
    readonly bundle: BundleSubstitutionSource;
    readonly replacement: ImportPathReplacement;
};

type DependencyModules = {
    readonly bundle: BundleSubstitutionSource;
    readonly specifierByInputFilePath: ReadonlyMap<string, string>;
};

export function ownsSourcePath(file: string, bundle: BundleSubstitutionSource): boolean {
    return bundle.contents.some(function (content) {
        return content.fileDescription.inputFilePath === file;
    });
}

function needsImportReplacement(file: string): boolean {
    return !file.endsWith('.map');
}

type ExportState = {
    readonly inputFilePath: string;
    readonly exportName: string | undefined;
};

function isExportStar(declaration: Readonly<typescript.ExportDeclaration>): boolean {
    return declaration.exportClause === undefined;
}

function exportedStateNames(
    lookup: SubstitutionSourceIndex,
    state: ExportState
): readonly ExportState[] {
    const content = lookup.contentBySourcePath.get(state.inputFilePath);
    if (content === undefined) {
        return Array.from(new Set<ExportState>());
    }

    const exported = lookup.exportsOf(content);
    const declarations = new Set(exported.stars);
    if (state.exportName === 'default') {
        declarations.clear();
    }
    exported.named.get(state.exportName)?.forEach(function (declaration) {
        declarations.add(declaration);
    });
    return Array.from(declarations).flatMap(function (declaration) {
        const inputFilePaths = lookup.inputPathsForExport(content.fileDescription.targetFilePath, declaration);
        if (isExportStar(declaration)) {
            return inputFilePaths.map(function (nextInputFilePath) {
                return { inputFilePath: nextInputFilePath, exportName: state.exportName };
            });
        }
        return namedExports(declaration)
            .filter(function matchesRequestedName(namedExport) {
                return namedExport.name.text === state.exportName;
            })
            .flatMap(function (namedExport) {
                const sourceExportName = namedExport.propertyName?.text ?? namedExport.name.text;
                return inputFilePaths.map(function (nextInputFilePath) {
                    return { inputFilePath: nextInputFilePath, exportName: sourceExportName };
                });
            });
    });
}

function publicModuleCanExport(
    rootInputFilePathsForModule: readonly string[],
    lookup: SubstitutionSourceIndex,
    request: ImportPathReplacementRequest,
    exportName: string | undefined
): boolean {
    const closure = breadthFirstClosure(
        rootInputFilePathsForModule.map(function (inputFilePath) {
            return { inputFilePath, exportName };
        }),
        function (state) {
            return exportedStateNames(lookup, state);
        },
        new Set(),
        {
            dependencies: {
                visitedHas(visited, value) {
                    return Array.from(visited).some(function (state) {
                        return state.inputFilePath === value.inputFilePath && state.exportName === value.exportName;
                    });
                },
                neighborAdded: undefined
            },
            maximumNodeCount: lookup.contentBySourcePath.size
        }
    );
    return Array.from(closure).some(function (state) {
        return state.inputFilePath === request.inputFilePath;
    });
}

function publicModuleReachesSourceFile(
    rootInputFilePathsForModule: readonly string[],
    lookup: SubstitutionSourceIndex,
    request: ImportPathReplacementRequest
): boolean {
    const closure = breadthFirstClosure(
        rootInputFilePathsForModule,
        function (inputFilePath) {
            const content = lookup.contentBySourcePath.get(inputFilePath);
            return content === undefined
                ? new Array<string>()
                : lookup.exportsOf(content).all.flatMap(function (declaration) {
                    return lookup.inputPathsForExport(content.fileDescription.targetFilePath, declaration);
                });
        },
        new Set(),
        {
            dependencies: {
                visitedHas(visited, value) {
                    return visited.has(value);
                },
                neighborAdded: undefined
            },
            maximumNodeCount: lookup.contentBySourcePath.size
        }
    );
    return closure.has(request.inputFilePath);
}

function publicModuleCanSatisfyRequest(
    rootInputFilePathsForModule: readonly string[],
    lookup: SubstitutionSourceIndex,
    request: ImportPathReplacementRequest
): boolean {
    if (rootInputFilePathsForModule.includes(request.inputFilePath)) {
        return true;
    }
    if (request.requiredExportNames.size === 0 && !request.requiresNamespaceExport) {
        return publicModuleReachesSourceFile(rootInputFilePathsForModule, lookup, request);
    }
    return Array.from(request.requiredExportNames).every(function (exportName) {
        return publicModuleCanExport(rootInputFilePathsForModule, lookup, request, exportName);
    }) && (!request.requiresNamespaceExport ||
        publicModuleCanExport(rootInputFilePathsForModule, lookup, request, undefined));
}

type PublicModule = {
    readonly specifier: string;
    readonly inputFilePaths: readonly string[];
};

function matchingPublicModuleSpecifier(
    modules: readonly PublicModule[],
    lookup: SubstitutionSourceIndex,
    request: ImportPathReplacementRequest
): string | undefined {
    return modules
        .toSorted(function (left, right) {
            return left.specifier.length - right.specifier.length;
        })
        .find(function (module) {
            return publicModuleCanSatisfyRequest(module.inputFilePaths, lookup, request);
        })
        ?.specifier;
}

function getExplicitPublicModuleSpecifierForSourcePath(
    bundle: BundleSubstitutionSource,
    surface: ExplicitPackageSurface,
    lookup: SubstitutionSourceIndex,
    request: ImportPathReplacementRequest
): string | undefined {
    const modules = (surface.packageInterface.modules ?? []).map(function (entry) {
        return {
            specifier: toPackageSpecifier(bundle.name, entry.export),
            inputFilePaths: rootInputFilePaths(getRoot(bundle, entry.root))
        };
    });
    return matchingPublicModuleSpecifier(modules, lookup, request);
}

function getImplicitPublicModuleSpecifierForSourcePath(
    bundle: BundleSubstitutionSource,
    surface: ImplicitPackageSurface,
    lookup: SubstitutionSourceIndex,
    request: ImportPathReplacementRequest
): string | undefined {
    const modules = [
        { specifier: bundle.name, inputFilePaths: rootInputFilePaths(getRoot(bundle, surface.defaultModuleRoot)) },
        ...Object.values(bundle.roots).map(function (root) {
            return { specifier: toRootPackageSpecifier(bundle.name, root), inputFilePaths: rootInputFilePaths(root) };
        })
    ];
    return matchingPublicModuleSpecifier(modules, lookup, request) ?? lookup.publicSpecifierFor(request.inputFilePath);
}

function getExistingPublicModuleSpecifierForSourcePath(
    bundle: BundleSubstitutionSource,
    lookup: SubstitutionSourceIndex,
    request: ImportPathReplacementRequest
): string | undefined {
    const { surface } = bundle;
    if (surface.mode === 'files') {
        return lookup.publicSpecifierFor(request.inputFilePath);
    }
    if (surface.mode === 'implicit') {
        return getImplicitPublicModuleSpecifierForSourcePath(bundle, surface, lookup, request);
    }

    return getExplicitPublicModuleSpecifierForSourcePath(bundle, surface, lookup, request);
}

function findReplacementInBundles(
    request: ImportPathReplacementRequest,
    bundles: readonly PeerModules[]
): ReplacementMatch | undefined {
    const candidates = bundles.filter(function ({ lookup }) {
        return lookup.contentBySourcePath.has(request.inputFilePath) || lookup.rootPaths.has(request.inputFilePath);
    });
    for (const { bundle, lookup } of candidates) {
        const targetPath = getExistingPublicModuleSpecifierForSourcePath(bundle, lookup, request);
        if (targetPath !== undefined) {
            return {
                bundle,
                replacement: {
                    emittedSpecifier: targetPath,
                    packageName: bundle.name
                }
            };
        }
        if (needsImportReplacement(request.inputFilePath) && ownsSourcePath(request.inputFilePath, bundle)) {
            throw new Error(
                `Package "${bundle.name}" does not expose "${request.inputFilePath}" for cross-package substitution`
            );
        }
    }

    return undefined;
}

function findReplacement(
    request: ImportPathReplacementRequest,
    dependencyModules: readonly DependencyModules[],
    bundlePeerDependencies: readonly PeerModules[]
): ReplacementMatch | undefined {
    const dependencyReplacement = dependencyModules
        .flatMap(function ({ bundle, specifierByInputFilePath }) {
            const emittedSpecifier = specifierByInputFilePath.get(request.inputFilePath);
            return emittedSpecifier === undefined
                ? []
                : { bundle, replacement: { emittedSpecifier, packageName: bundle.name } };
        })[0];
    if (dependencyReplacement !== undefined) {
        return dependencyReplacement;
    }
    return findReplacementInBundles(request, bundlePeerDependencies);
}

function withSubstitutedSourcePath(
    substitutedInputFilePathsByPackageName: ReadonlyMap<string, ReadonlySet<string>>,
    packageName: string,
    file: string
): ReadonlyMap<string, ReadonlySet<string>> {
    const existing = substitutedInputFilePathsByPackageName.get(packageName) ?? [];
    const updated = new Map(substitutedInputFilePathsByPackageName);
    updated.set(packageName, new Set([ ...existing, file ]));
    return updated;
}

function contentWithInputFilePath(
    bundle: BundleSubstitutionSource,
    inputFilePath: string
): BundleSubstitutionSource['contents'][number] | undefined {
    return bundle.contents.find(function (content) {
        return content.fileDescription.inputFilePath === inputFilePath;
    });
}

function runtimeInputFilePathForDeclaration(
    bundle: BundleSubstitutionSource,
    declarationContent: BundleSubstitutionSource['contents'][number]
): string | undefined {
    const runtimeContent = bundle.contents.find(function (content) {
        return declarationCompanionCandidates(content.fileDescription.targetFilePath)
            .includes(declarationContent.fileDescription.targetFilePath);
    });
    return runtimeContent?.fileDescription.inputFilePath;
}

function substitutedInputFilePathsFor(
    bundle: BundleSubstitutionSource,
    file: string
): readonly string[] {
    const content = contentWithInputFilePath(bundle, file);
    if (content === undefined || !isDeclarationCompanionFilePath(content.fileDescription.targetFilePath)) {
        return declarationCompanionCandidates(file).length === 0
            ? []
            : [
                file
            ];
    }

    const runtimeInputFilePath = runtimeInputFilePathForDeclaration(bundle, content);
    if (runtimeInputFilePath === undefined) {
        return [
            file
        ];
    }

    return [
        runtimeInputFilePath,
        file
    ];
}

function withSubstitutedSourcePaths(
    substitutedInputFilePathsByPackageName: ReadonlyMap<string, ReadonlySet<string>>,
    match: ReplacementMatch,
    request: ImportPathReplacementRequest
): ReadonlyMap<string, ReadonlySet<string>> {
    let updated = substitutedInputFilePathsByPackageName;
    for (const inputFilePath of substitutedInputFilePathsFor(match.bundle, request.inputFilePath)) {
        updated = withSubstitutedSourcePath(updated, match.replacement.packageName, inputFilePath);
    }
    return updated;
}

function findPathReplacements(
    requests: readonly ImportPathReplacementRequest[],
    dependencyModules: readonly DependencyModules[],
    bundlePeerDependencies: readonly PeerModules[]
): Replacements {
    const importPathReplacements = new Map<string, ImportPathReplacement>();
    const matchedBundleDependencies: string[] = [];
    let substitutedInputFilePathsByPackageName: ReadonlyMap<string, ReadonlySet<string>> = new Map();

    function recordReplacement(match: ReplacementMatch, request: ImportPathReplacementRequest): void {
        importPathReplacements.set(request.inputFilePath, match.replacement);
        matchedBundleDependencies.push(match.replacement.packageName);
        substitutedInputFilePathsByPackageName = withSubstitutedSourcePaths(
            substitutedInputFilePathsByPackageName,
            match,
            request
        );
    }

    for (const request of requests) {
        const replacement = findReplacement(request, dependencyModules, bundlePeerDependencies);
        if (replacement !== undefined) {
            recordReplacement(replacement, request);
        }
    }

    return {
        importPathReplacements,
        bundleDependencies: matchedBundleDependencies,
        substitutedInputFilePathsByPackageName
    };
}

type PeerModules = {
    readonly bundle: BundleSubstitutionSource;
    readonly lookup: SubstitutionSourceIndex;
};

export function createPathReplacementLookup(
    bundleDependencies: readonly BundleSubstitutionSource[],
    bundlePeerDependencies: readonly BundleSubstitutionSource[]
): (requests: readonly ImportPathReplacementRequest[]) => Replacements {
    const dependencyModules = bundleDependencies.map(function indexDependencyModules(bundle) {
        return { bundle, specifierByInputFilePath: indexPublicModules(bundle).specifierByInputFilePath };
    });
    const peerModules = bundlePeerDependencies.map(function (bundle) {
        return { bundle, lookup: createSubstitutionSourceIndex(bundle) };
    });
    return function (requests) {
        return findPathReplacements(requests, dependencyModules, peerModules);
    };
}
