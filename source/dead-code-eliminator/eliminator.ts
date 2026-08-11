import path from 'node:path';
import { getImportMetaResolveLiterals } from '../dependency-scanner/source-file-references.ts';
import type { ProgressBroadcastProvider } from '../progress/progress-broadcaster.ts';
import type { AnalyzedBundle, AnalyzedBundleResource, DeadCodeEliminator } from './analyzed-bundle.ts';
import { buildAnalyzedResource, type AnalysisContext } from './code-file-analyzer.ts';
import { buildCrossBundleSeeds, type CrossBundleInput } from './cross-bundle/cross-bundle-seeds.ts';
import { maybeEmitElimination } from './elimination-emitter.ts';
import { loadBundle, type CreateProject, type LoadedBundle } from './load-bundle.ts';
import { buildMapPathTransformIndex, recomposePairedSourceMaps } from './source-map-recomposition.ts';
import { computeSideEffectsField } from './side-effects-field.ts';

type Dependency = {
    readonly name: string;
    readonly referencedFrom: readonly [string, ...(readonly string[])];
};

type Dependencies = ReadonlyMap<string, Dependency>;

type MetadataBundle = {
    readonly externalDependencies: Dependencies;
    readonly linkedBundleDependencies: Dependencies;
    readonly substitutedSourceFilePathsByPackageName: ReadonlyMap<string, ReadonlySet<string>>;
};

type LoadedSourceFile = NonNullable<LoadedBundle['loaded'][number]['sourceFile']>;

type SourceFileByPath = ReadonlyMap<string, LoadedSourceFile>;

type ReferencedPackages = {
    readonly externalDependencies: Dependencies;
    readonly linkedBundleDependencies: Dependencies;
    readonly substitutedSourceFilePathsByPackageName: ReadonlyMap<string, ReadonlySet<string>>;
};

type ExternalDependencyRecorder = {
    readonly get: (key: string) => Dependency | undefined;
    readonly set: (key: string, value: Dependency) => unknown;
};

const scopedPackageSegmentCount = 2;
const codeFileExtensions = new Set([ '.cjs', '.cts', '.js', '.jsx', '.mjs', '.mts', '.ts', '.tsx' ]);
const declarationCodeFileExtensions = [ '.d.ts', '.d.cts', '.d.mts' ];

function packageNameFromSpecifier(specifier: string): string {
    if (!specifier.startsWith('@')) {
        return specifier.split('/', 1)[0] ?? specifier;
    }
    const [ scope, name ] = specifier.split('/', scopedPackageSegmentCount);
    if (name === undefined) {
        throw new Error(`Invalid package specifier "${specifier}"`);
    }
    return `${scope}/${name}`;
}

function isRelativeOrAbsoluteSpecifier(specifier: string): boolean {
    return specifier.startsWith('.') || path.isAbsolute(specifier);
}

function collectImportSpecifiers(sourceFile: LoadedSourceFile): readonly string[] {
    return [
        ...sourceFile.getImportStringLiterals(),
        ...getImportMetaResolveLiterals(sourceFile)
    ]
        .map(function (literal) {
            return literal.getLiteralValue();
        });
}

function isCodeFilePath(filePath: string): boolean {
    return codeFileExtensions.has(path.extname(filePath));
}

function isDeclarationCodeFilePath(filePath: string): boolean {
    return declarationCodeFileExtensions.some(function (extension) {
        return filePath.endsWith(extension);
    });
}

function isRuntimeCodeFilePath(filePath: string): boolean {
    return isCodeFilePath(filePath) && !isDeclarationCodeFilePath(filePath);
}

function packageNamesFor(
    resource: AnalyzedBundleResource,
    sourceFilesByPath: SourceFileByPath
): ReadonlySet<string> {
    const names = new Set<string>();
    for (const [ sourceFilePath, sourceFile ] of sourceFilesByPath) {
        if (sourceFilePath === resource.fileDescription.sourceFilePath) {
            for (const specifier of collectImportSpecifiers(sourceFile)) {
                if (!isRelativeOrAbsoluteSpecifier(specifier) && !specifier.startsWith('#')) {
                    names.add(packageNameFromSpecifier(specifier));
                }
            }
        }
    }
    return names;
}

function localCandidates(sourceFilePath: string, specifier: string): readonly string[] {
    const resolved = path.resolve(path.dirname(sourceFilePath), specifier);
    const candidates = [ resolved ];
    if (sourceFilePath.endsWith('.d.ts')) {
        candidates.push(resolved.replace(/\.js$/u, '.d.ts'));
    }
    candidates.push(
        `${resolved}.js`,
        `${resolved}.jsx`,
        `${resolved}.ts`,
        `${resolved}.tsx`,
        `${resolved}.json`
    );
    return candidates;
}

function survivingLocalPaths(
    resource: AnalyzedBundleResource,
    sourceFilesByPath: SourceFileByPath
): ReadonlySet<string> {
    const paths = new Set<string>();
    for (const [ sourceFilePath, sourceFile ] of sourceFilesByPath) {
        if (sourceFilePath === resource.fileDescription.sourceFilePath) {
            for (const specifier of collectImportSpecifiers(sourceFile)) {
                if (isRelativeOrAbsoluteSpecifier(specifier)) {
                    for (const candidate of localCandidates(resource.fileDescription.sourceFilePath, specifier)) {
                        paths.add(candidate);
                    }
                }
            }
        }
    }
    return paths;
}

function recomputeDirectDependencies(
    resource: AnalyzedBundleResource,
    sourceFilesByPath: SourceFileByPath
): AnalyzedBundleResource {
    if (!isCodeFilePath(resource.fileDescription.targetFilePath)) {
        return resource;
    }

    const survivingPaths = survivingLocalPaths(resource, sourceFilesByPath);
    return {
        ...resource,
        directDependencies: new Set(
            Array.from(resource.directDependencies).filter(function (dependency) {
                return survivingPaths.has(dependency) || dependency.endsWith('.map');
            })
        )
    };
}

function referencedPackagesByPath(
    contents: readonly AnalyzedBundleResource[],
    sourceFilesByPath: SourceFileByPath
): ReadonlyMap<string, ReadonlySet<string>> {
    return new Map(contents.map(function (resource) {
        return [ resource.fileDescription.sourceFilePath, packageNamesFor(resource, sourceFilesByPath) ];
    }));
}

function addReference(dependencies: ExternalDependencyRecorder, dependencyName: string, referencedFrom: string): void {
    const dependency = dependencies.get(dependencyName);
    dependencies.set(dependencyName, {
        name: dependencyName,
        referencedFrom: dependency === undefined ? [ referencedFrom ] : [ ...dependency.referencedFrom, referencedFrom ]
    });
}

function recomputeDependencies(
    dependencies: Dependencies,
    packagesByPath: ReadonlyMap<string, ReadonlySet<string>>,
    preservedReferencePaths: ReadonlySet<string>
): Dependencies {
    const recomputed = new Map<string, Dependency>();
    for (const dependency of dependencies.values()) {
        for (const reference of dependency.referencedFrom) {
            if (
                preservedReferencePaths.has(reference) ||
                packagesByPath.get(reference)?.has(dependency.name) === true
            ) {
                addReference(recomputed, dependency.name, reference);
            }
        }
    }
    return recomputed;
}

function declarationSourcePaths(contents: readonly AnalyzedBundleResource[]): ReadonlySet<string> {
    const paths = new Set<string>();
    for (const resource of contents) {
        if (resource.fileDescription.targetFilePath.endsWith('.d.ts')) {
            paths.add(resource.fileDescription.sourceFilePath);
        }
    }
    return paths;
}

function filterSubstitutedSourcePaths(
    substitutedSourceFilePathsByPackageName: ReadonlyMap<string, ReadonlySet<string>>,
    linkedBundleDependencies: Dependencies
): ReadonlyMap<string, ReadonlySet<string>> {
    return new Map(
        Array.from(substitutedSourceFilePathsByPackageName).filter(function ([ packageName ]) {
            return linkedBundleDependencies.has(packageName);
        })
    );
}

function recomputeDependencyMetadata(
    bundle: MetadataBundle,
    contents: readonly AnalyzedBundleResource[],
    sourceFilesByPath: SourceFileByPath
): ReferencedPackages & { readonly contents: readonly AnalyzedBundleResource[]; } {
    const recomputedContents = contents.map(function (resource) {
        return recomputeDirectDependencies(resource, sourceFilesByPath);
    });
    const packagesByPath = referencedPackagesByPath(recomputedContents, sourceFilesByPath);
    const preservedReferencePaths = declarationSourcePaths(recomputedContents);
    const linkedBundleDependencies = recomputeDependencies(
        bundle.linkedBundleDependencies,
        packagesByPath,
        preservedReferencePaths
    );
    return {
        contents: recomputedContents,
        externalDependencies: recomputeDependencies(
            bundle.externalDependencies,
            packagesByPath,
            preservedReferencePaths
        ),
        linkedBundleDependencies,
        substitutedSourceFilePathsByPackageName: filterSubstitutedSourcePaths(
            bundle.substitutedSourceFilePathsByPackageName,
            linkedBundleDependencies
        )
    };
}

function rootSourceFilePaths(bundle: Pick<AnalyzedBundle, 'roots'>): ReadonlySet<string> {
    const paths = new Set<string>();
    for (const root of Object.values(bundle.roots)) {
        paths.add(root.js.sourceFilePath);
    }
    return paths;
}

function resourceHasSurvivingRuntime(resource: AnalyzedBundleResource): boolean {
    return resource.analysis.sideEffectStatements.length > 0 || resource.analysis.survivingBindings.size > 0;
}

function shouldSeedResource(resource: AnalyzedBundleResource, rootPaths: ReadonlySet<string>): boolean {
    return (
        rootPaths.has(resource.fileDescription.sourceFilePath) ||
        resource.isExplicitlyIncluded ||
        !isRuntimeCodeFilePath(resource.fileDescription.targetFilePath) ||
        resourceHasSurvivingRuntime(resource)
    );
}

function indexResourcesBySourcePath(
    contents: readonly AnalyzedBundleResource[]
): ReadonlyMap<string, AnalyzedBundleResource> {
    return new Map(contents.map(function (resource) {
        return [ resource.fileDescription.sourceFilePath, resource ];
    }));
}

function retentionSeeds(
    contents: readonly AnalyzedBundleResource[],
    rootPaths: ReadonlySet<string>
): readonly string[] {
    return contents
        .filter(function (resource) {
            return shouldSeedResource(resource, rootPaths);
        })
        .map(function (resource) {
            return resource.fileDescription.sourceFilePath;
        });
}

function retainedSourcePaths(
    bundle: Pick<AnalyzedBundle, 'roots'>,
    contents: readonly AnalyzedBundleResource[]
): ReadonlySet<string> {
    const rootPaths = rootSourceFilePaths(bundle);
    const resourcesBySourcePath = indexResourcesBySourcePath(contents);
    const pending = Array.from(retentionSeeds(contents, rootPaths));
    const retained = new Set<string>();

    function retain(sourceFilePath: string): void {
        const resource = resourcesBySourcePath.get(sourceFilePath);
        if (resource !== undefined && !retained.has(sourceFilePath)) {
            retained.add(sourceFilePath);
            pending.push(...resource.directDependencies);
        }
    }

    for (const sourceFilePath of pending) {
        retain(sourceFilePath);
    }
    return retained;
}

function isPrunedRuntimeCode(resource: AnalyzedBundleResource, retained: ReadonlySet<string>): boolean {
    return (
        !retained.has(resource.fileDescription.sourceFilePath) &&
        isRuntimeCodeFilePath(resource.fileDescription.targetFilePath)
    );
}

function prunedMapTargetPaths(
    contents: readonly AnalyzedBundleResource[],
    retained: ReadonlySet<string>
): ReadonlySet<string> {
    return new Set(
        contents
            .filter(function (resource) {
                return isPrunedRuntimeCode(resource, retained);
            })
            .map(function (resource) {
                return `${resource.fileDescription.targetFilePath}.map`;
            })
    );
}

function pruneContents(
    bundle: Pick<AnalyzedBundle, 'roots'>,
    contents: readonly AnalyzedBundleResource[],
    transformationsEnabled: boolean
): readonly AnalyzedBundleResource[] {
    if (!transformationsEnabled) {
        return contents;
    }
    const retained = retainedSourcePaths(bundle, contents);
    const prunedMapTargets = prunedMapTargetPaths(contents, retained);
    return contents.filter(function (resource) {
        if (resource.isExplicitlyIncluded) {
            return true;
        }
        return (
            retained.has(resource.fileDescription.sourceFilePath) &&
            !prunedMapTargets.has(resource.fileDescription.targetFilePath)
        );
    });
}

function crossBundleInputFrom(loaded: LoadedBundle): CrossBundleInput {
    const sourceFiles: LoadedSourceFile[] = [];

    for (const entry of loaded.loaded) {
        if (entry.sourceFile !== undefined) {
            sourceFiles.push(entry.sourceFile);
        }
    }

    return {
        bundle: loaded.input.bundle,
        sourceFiles,
        fileBindings: loaded.fileBindings,
        localReachable: loaded.reachability.localReachable
    };
}

function indexSourceFiles(loaded: LoadedBundle): SourceFileByPath {
    const result = new Map<string, LoadedSourceFile>();
    for (const entry of loaded.loaded) {
        if (entry.sourceFile !== undefined) {
            result.set(entry.resource.fileDescription.sourceFilePath, entry.sourceFile);
        }
    }
    return result;
}

function analyzeBundleWithSeeds(loaded: LoadedBundle, externalSeeds: ReadonlySet<string> | undefined): AnalyzedBundle {
    const context: AnalysisContext = {
        reachable: loaded.reachability.expandWith(externalSeeds),
        transformationsEnabled: loaded.input.transformationsEnabled,
        deadCodeElimination: loaded.input.deadCodeElimination
    };
    const outputs = loaded.loaded.map(function (entry) {
        return buildAnalyzedResource(entry, context);
    });
    const transformsByMapPath = buildMapPathTransformIndex(
        outputs,
        loaded.input.bundle.sourceMapTransformsByTargetPath
    );
    const contents = outputs.map(function (output) {
        return output.resource;
    });
    const finalContents = recomposePairedSourceMaps(contents, transformsByMapPath);
    const sourceFilesByPath = indexSourceFiles(loaded);
    const prePruneMetadata = recomputeDependencyMetadata(
        loaded.input.bundle,
        finalContents,
        sourceFilesByPath
    );
    const prunedContents = pruneContents(
        loaded.input.bundle,
        prePruneMetadata.contents,
        loaded.input.transformationsEnabled
    );
    const dependencyMetadata = recomputeDependencyMetadata(
        loaded.input.bundle,
        prunedContents,
        sourceFilesByPath
    );
    return {
        ...loaded.input.bundle,
        ...dependencyMetadata,
        sideEffectsField: computeSideEffectsField(dependencyMetadata.contents)
    };
}

export type DeadCodeEliminatorDependencies = {
    readonly createProject: CreateProject;
    readonly progressBroadcaster: ProgressBroadcastProvider;
};

export function createDeadCodeEliminator(dependencies: DeadCodeEliminatorDependencies): DeadCodeEliminator {
    const { createProject, progressBroadcaster } = dependencies;
    return {
        async eliminate(inputs) {
            const loadedBundles = inputs.map(function (input) {
                return loadBundle(createProject, input);
            });
            const seedMap = buildCrossBundleSeeds(loadedBundles.map(crossBundleInputFrom));
            const analyzed = loadedBundles.map(function (loaded) {
                return analyzeBundleWithSeeds(loaded, seedMap.get(loaded.input.bundle.name));
            });
            maybeEmitElimination(
                progressBroadcaster,
                inputs.map(function (input) {
                    return input.bundle;
                }),
                analyzed
            );
            return analyzed;
        }
    };
}
