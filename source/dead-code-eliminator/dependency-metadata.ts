import { unique, uniqueBy } from 'remeda';
import type {
    DependencyReference,
    ExternalDependencies,
    ExternalDependency
} from '../dependency-scanner/external-dependencies.ts';
import { getModuleReferenceLiterals } from '../dependency-scanner/source-file-references.ts';
import type { ArtifactModuleReference } from '../resource-resolver/resolved-bundle.ts';
import type { AnalyzedBundleResource } from './analyzed-bundle.ts';
import type { LoadedBundle } from './load-bundle.ts';
import { isCodeTargetPath } from './liveness/runtime-code.ts';

type MetadataBundle = {
    readonly externalDependencies: ExternalDependencies;
    readonly linkedBundleDependencies: ExternalDependencies;
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
    specifiers: ReadonlySet<string>
): ReadonlySet<string> {
    return new Set(
        resource.moduleReferences.flatMap(function (reference) {
            return isLocalDependencyReference(reference) && specifiers.has(reference.emittedSpecifier)
                ? reference.targetFilePath
                : [];
        })
    );
}

function recomputeDirectDependencies(
    resource: AnalyzedBundleResource,
    specifiers: ReadonlySet<string>
): AnalyzedBundleResource {
    if (!isCodeTargetPath(resource.fileDescription.targetFilePath)) {
        return resource;
    }

    const survivingPaths = survivingLocalTargets(resource, specifiers);
    return {
        ...resource,
        directDependencies: new Set(
            Array.from(resource.directDependencies).filter(function (dependency) {
                return survivingPaths.has(dependency) || dependency.endsWith('.map');
            })
        )
    };
}

function referencedPackages(
    resource: AnalyzedBundleResource,
    specifiers: ReadonlySet<string>
): ReadonlyMap<string, ReadonlySet<string>> {
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
    return packagesByName;
}

function legacyDependencyReference(dependency: ExternalDependency, targetFilePath: string): DependencyReference {
    return {
        targetFilePath,
        sourceSpecifier: dependency.name,
        emittedSpecifier: dependency.name
    };
}

function legacyDependencyReferences(
    dependency: ExternalDependency
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
    dependency: ExternalDependency
): readonly [DependencyReference, ...(readonly DependencyReference[])] {
    return dependency.references ?? legacyDependencyReferences(dependency);
}

function mergeDependencyReferences(
    dependency: ExternalDependency,
    reference: DependencyReference
): readonly [DependencyReference, ...(readonly DependencyReference[])] {
    return uniqueBy([ ...dependencyReferences(dependency), reference ], function dependencyReferenceIdentity(value) {
        return JSON.stringify([ value.targetFilePath, value.sourceSpecifier, value.emittedSpecifier ]);
    });
}

function shouldPreserveDependencyReference(
    dependency: ExternalDependency,
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
    dependencies: ExternalDependencies,
    packagesByPath: ReadonlyMap<string, ReadonlyMap<string, ReadonlySet<string>>>,
    preservedReferencePaths: ReadonlySet<string>
): ExternalDependencies {
    const recomputed = new Map<string, ExternalDependency>();
    function addReference(dependencyName: string, reference: DependencyReference): void {
        const dependency = recomputed.get(dependencyName);
        if (dependency === undefined) {
            recomputed.set(dependencyName, {
                name: dependencyName,
                referencedFrom: [ reference.targetFilePath ],
                references: [ reference ]
            });
            return;
        }
        recomputed.set(dependencyName, {
            name: dependencyName,
            referencedFrom: unique([ ...dependency.referencedFrom, reference.targetFilePath ]),
            references: mergeDependencyReferences(dependency, reference)
        });
    }
    for (const dependency of dependencies.values()) {
        for (const reference of dependencyReferences(dependency)) {
            if (shouldPreserveDependencyReference(dependency, reference, packagesByPath, preservedReferencePaths)) {
                addReference(dependency.name, reference);
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
    linkedBundleDependencies: ExternalDependencies
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

function metadataForRetainedResources(
    bundle: MetadataBundle,
    contents: readonly AnalyzedBundleResource[],
    packagesByPath: ReadonlyMap<string, ReadonlyMap<string, ReadonlySet<string>>>
): MetadataBundle & { readonly contents: readonly AnalyzedBundleResource[]; } {
    const retainedPaths = new Set(contents.map(function (resource) {
        return resource.fileDescription.targetFilePath;
    }));
    const retainedPackages = new Map(
        Array.from(packagesByPath).filter(function ([ targetFilePath ]) {
            return retainedPaths.has(targetFilePath);
        })
    );
    const preservedReferencePaths = declarationTargetPaths(contents);
    const linkedBundleDependencies = recomputeDependencies(
        bundle.linkedBundleDependencies,
        retainedPackages,
        preservedReferencePaths
    );
    return {
        contents,
        externalDependencies: recomputeDependencies(
            bundle.externalDependencies,
            retainedPackages,
            preservedReferencePaths
        ),
        linkedBundleDependencies,
        substitutedInputFilePathsByPackageName: filterSubstitutedSourcePaths(
            bundle.substitutedInputFilePathsByPackageName,
            linkedBundleDependencies
        )
    };
}

export function recomputeDependencyMetadata(
    bundle: MetadataBundle,
    contents: readonly AnalyzedBundleResource[],
    sourceFileIndex: SourceFileByPath,
    retainContents: (resources: readonly AnalyzedBundleResource[]) => readonly AnalyzedBundleResource[]
): MetadataBundle & { readonly contents: readonly AnalyzedBundleResource[]; } {
    const recomputedContents: AnalyzedBundleResource[] = [];
    const packagesByPath = new Map<string, ReadonlyMap<string, ReadonlySet<string>>>();
    for (const resource of contents) {
        const specifiers = survivingSpecifiersFor(resource, sourceFileIndex);
        recomputedContents.push(recomputeDirectDependencies(resource, specifiers));
        packagesByPath.set(resource.fileDescription.targetFilePath, referencedPackages(resource, specifiers));
    }
    return metadataForRetainedResources(bundle, retainContents(recomputedContents), packagesByPath);
}
