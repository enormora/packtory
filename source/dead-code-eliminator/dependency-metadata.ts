import { getModuleReferenceLiterals } from '../dependency-scanner/source-file-references.ts';
import type { ArtifactModuleReference } from '../resource-resolver/resolved-bundle.ts';
import type { AnalyzedBundleResource } from './analyzed-bundle.ts';
import type { LoadedBundle } from './load-bundle.ts';
import { isCodeTargetPath } from './liveness/runtime-code.ts';

type Dependency = {
    readonly name: string;
    readonly referencedFrom: readonly [string, ...(readonly string[])];
    readonly references?: readonly [DependencyReference, ...(readonly DependencyReference[])] | undefined;
};

type Dependencies = ReadonlyMap<string, Dependency>;

type DependencyReference = {
    readonly targetFilePath: string;
    readonly sourceSpecifier: string;
    readonly emittedSpecifier: string;
};

type MetadataBundle = {
    readonly externalDependencies: Dependencies;
    readonly linkedBundleDependencies: Dependencies;
    readonly substitutedInputFilePathsByPackageName: ReadonlyMap<string, ReadonlySet<string>>;
};

type LoadedSourceFile = NonNullable<LoadedBundle['loaded'][number]['sourceFile']>;
type LocalDependencyReference = Extract<
    ArtifactModuleReference,
    { readonly type: 'generated-manifest' | 'local-asset' | 'local-code'; }
>;
type PackageDependencyReference = Extract<
    ArtifactModuleReference,
    { readonly type: 'external-package' | 'linked-code'; }
>;

export type SourceFileByPath = ReadonlyMap<string, Readonly<LoadedSourceFile>>;

type ReferencedPackages = {
    readonly externalDependencies: Dependencies;
    readonly linkedBundleDependencies: Dependencies;
    readonly substitutedInputFilePathsByPackageName: ReadonlyMap<string, ReadonlySet<string>>;
};

type ExternalDependencyRecorder = {
    readonly get: (key: string) => Dependency | undefined;
    readonly set: (key: string, value: Dependency) => unknown;
};

function hasPackageName(reference: ArtifactModuleReference): reference is PackageDependencyReference {
    return Object.hasOwn(reference, 'packageName');
}

function isLocalDependencyReference(reference: ArtifactModuleReference): reference is LocalDependencyReference {
    return Object.hasOwn(reference, 'targetFilePath') && !hasPackageName(reference);
}

const isPackageDependencyReference = hasPackageName;

function survivingSpecifiersFor(
    resource: AnalyzedBundleResource,
    sourceFilesByPath: SourceFileByPath
): ReadonlySet<string> {
    const sourceFile = sourceFilesByPath.get(resource.fileDescription.targetFilePath);
    if (sourceFile === undefined) {
        return new Set<string>();
    }
    return new Set(
        getModuleReferenceLiterals(sourceFile).map(function (literal) {
            return literal.getLiteralValue();
        })
    );
}

function survivingLocalTargets(
    resource: AnalyzedBundleResource,
    sourceFilesByPath: SourceFileByPath
): ReadonlySet<string> {
    const specifiers = survivingSpecifiersFor(resource, sourceFilesByPath);
    return new Set(
        resource.moduleReferences.flatMap(function (reference) {
            return isLocalDependencyReference(reference) && specifiers.has(reference.emittedSpecifier)
                ? [ reference.targetFilePath ]
                : [];
        })
    );
}

function recomputeDirectDependencies(
    resource: AnalyzedBundleResource,
    sourceFilesByPath: SourceFileByPath
): AnalyzedBundleResource {
    if (!isCodeTargetPath(resource.fileDescription.targetFilePath)) {
        return resource;
    }

    const survivingPaths = survivingLocalTargets(resource, sourceFilesByPath);
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
): ReadonlyMap<string, ReadonlyMap<string, ReadonlySet<string>>> {
    return new Map(contents.map(function (resource) {
        const specifiers = survivingSpecifiersFor(resource, sourceFilesByPath);
        const packagesByName = new Map<string, ReadonlySet<string>>();
        const survivingReferences = resource
            .moduleReferences
            .filter(isPackageDependencyReference)
            .filter(function (reference) {
                return specifiers.has(reference.emittedSpecifier);
            });
        for (const reference of survivingReferences) {
            const existing = packagesByName.get(reference.packageName) ?? [];
            packagesByName.set(reference.packageName, new Set([ ...existing, reference.emittedSpecifier ]));
        }
        return [ resource.fileDescription.targetFilePath, packagesByName ];
    }));
}

function legacyDependencyReference(dependency: Dependency, targetFilePath: string): DependencyReference {
    return {
        targetFilePath,
        sourceSpecifier: dependency.name,
        emittedSpecifier: dependency.name
    };
}

function legacyDependencyReferences(
    dependency: Dependency
): readonly [DependencyReference, ...(readonly DependencyReference[])] {
    const [ targetFilePath, ...rest ] = dependency.referencedFrom;
    return [
        legacyDependencyReference(dependency, targetFilePath),
        ...rest.map(function (filePath) {
            return legacyDependencyReference(dependency, filePath);
        })
    ];
}

function dependencyReferences(
    dependency: Dependency
): readonly [DependencyReference, ...(readonly DependencyReference[])] {
    return dependency.references ?? legacyDependencyReferences(dependency);
}

function isSameDependencyReference(left: DependencyReference, right: DependencyReference): boolean {
    return left.targetFilePath === right.targetFilePath &&
        left.sourceSpecifier === right.sourceSpecifier &&
        left.emittedSpecifier === right.emittedSpecifier;
}

function uniqueDependencyReferences(
    references: readonly [DependencyReference, ...(readonly DependencyReference[])]
): readonly [DependencyReference, ...(readonly DependencyReference[])] {
    const [ firstReference, ...rest ] = references;
    const unique: [DependencyReference, ...DependencyReference[]] = [ firstReference ];
    for (const reference of rest) {
        const isNewReference = unique.every(function (value) {
            return !isSameDependencyReference(value, reference);
        });
        if (isNewReference) {
            unique.push(reference);
        }
    }
    return unique;
}

function mergeDependencyTargetPaths(
    dependency: Dependency,
    reference: DependencyReference
): readonly [string, ...(readonly string[])] {
    const sourcePaths = new Set([ ...dependency.referencedFrom, reference.targetFilePath ]);
    sourcePaths.delete(dependency.referencedFrom[0]);
    return [ dependency.referencedFrom[0], ...sourcePaths ];
}

function mergeDependencyReferences(
    dependency: Dependency,
    reference: DependencyReference
): readonly [DependencyReference, ...(readonly DependencyReference[])] {
    const [ firstReference, ...rest ] = dependencyReferences(dependency);
    return uniqueDependencyReferences([ firstReference, ...rest, reference ]);
}

function addReference(
    dependencies: ExternalDependencyRecorder,
    dependencyName: string,
    reference: DependencyReference
): void {
    const dependency = dependencies.get(dependencyName);
    if (dependency === undefined) {
        dependencies.set(dependencyName, {
            name: dependencyName,
            referencedFrom: [ reference.targetFilePath ],
            references: [ reference ]
        });
        return;
    }
    dependencies.set(dependencyName, {
        name: dependencyName,
        referencedFrom: mergeDependencyTargetPaths(dependency, reference),
        references: mergeDependencyReferences(dependency, reference)
    });
}

function shouldPreserveDependencyReference(
    dependency: Dependency,
    reference: DependencyReference,
    packagesByPath: ReadonlyMap<string, ReadonlyMap<string, ReadonlySet<string>>>,
    preservedReferencePaths: ReadonlySet<string>
): boolean {
    if (preservedReferencePaths.has(reference.targetFilePath)) {
        return true;
    }
    const emittedSpecifiers = packagesByPath.get(reference.targetFilePath)?.get(dependency.name);
    if (emittedSpecifiers === undefined) {
        return false;
    }
    return dependency.references === undefined ||
        emittedSpecifiers.has(reference.emittedSpecifier);
}

function recomputeDependencies(
    dependencies: Dependencies,
    packagesByPath: ReadonlyMap<string, ReadonlyMap<string, ReadonlySet<string>>>,
    preservedReferencePaths: ReadonlySet<string>
): Dependencies {
    const recomputed = new Map<string, Dependency>();
    for (const dependency of dependencies.values()) {
        for (const reference of dependencyReferences(dependency)) {
            if (shouldPreserveDependencyReference(dependency, reference, packagesByPath, preservedReferencePaths)) {
                addReference(recomputed, dependency.name, reference);
            }
        }
    }
    return recomputed;
}

function declarationTargetPaths(contents: readonly AnalyzedBundleResource[]): ReadonlySet<string> {
    const paths = new Set<string>();
    for (const resource of contents) {
        if (resource.fileDescription.targetFilePath.endsWith('.d.ts')) {
            paths.add(resource.fileDescription.targetFilePath);
        }
    }
    return paths;
}

function filterSubstitutedSourcePaths(
    substitutedInputFilePathsByPackageName: ReadonlyMap<string, ReadonlySet<string>>,
    linkedBundleDependencies: Dependencies
): ReadonlyMap<string, ReadonlySet<string>> {
    return new Map(
        Array.from(substitutedInputFilePathsByPackageName).filter(function ([ packageName ]) {
            return linkedBundleDependencies.has(packageName);
        })
    );
}

export function indexSourceFiles(loaded: LoadedBundle): SourceFileByPath {
    return new Map(loaded.fileBindings.map(function (binding) {
        return [ binding.targetFilePath, binding.sourceFile ];
    }));
}

export function recomputeDependencyMetadata(
    bundle: MetadataBundle,
    contents: readonly AnalyzedBundleResource[],
    sourceFileIndex: SourceFileByPath
): ReferencedPackages & { readonly contents: readonly AnalyzedBundleResource[]; } {
    const recomputedContents = contents.map(function (resource) {
        return recomputeDirectDependencies(resource, sourceFileIndex);
    });
    const packagesByPath = referencedPackagesByPath(recomputedContents, sourceFileIndex);
    const preservedReferencePaths = declarationTargetPaths(recomputedContents);
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
        substitutedInputFilePathsByPackageName: filterSubstitutedSourcePaths(
            bundle.substitutedInputFilePathsByPackageName,
            linkedBundleDependencies
        )
    };
}
