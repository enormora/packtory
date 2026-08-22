import path from 'node:path';
import { getModuleReferenceLiterals } from '../dependency-scanner/source-file-references.ts';
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
    readonly sourceFilePath: string;
    readonly sourceSpecifier: string;
    readonly emittedSpecifier: string;
};

type MetadataBundle = {
    readonly externalDependencies: Dependencies;
    readonly linkedBundleDependencies: Dependencies;
    readonly substitutedSourceFilePathsByPackageName: ReadonlyMap<string, ReadonlySet<string>>;
};

type LoadedSourceFile = NonNullable<LoadedBundle['loaded'][number]['sourceFile']>;

export type SourceFileByPath = ReadonlyMap<string, Readonly<LoadedSourceFile>>;

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

function isPackageSpecifier(specifier: string): boolean {
    return !isRelativeOrAbsoluteSpecifier(specifier) && !specifier.startsWith('#');
}

function collectImportSpecifiers(sourceFile: Readonly<LoadedSourceFile>): readonly string[] {
    return getModuleReferenceLiterals(sourceFile)
        .map(function (literal) {
            return literal.getLiteralValue();
        });
}

function addPackageSpecifier(
    specifiersByName: ReadonlyMap<string, ReadonlySet<string>>,
    specifier: string
): ReadonlyMap<string, ReadonlySet<string>> {
    const name = packageNameFromSpecifier(specifier);
    const specifiers = new Set(specifiersByName.get(name));
    specifiers.add(specifier);
    const next = new Map(specifiersByName);
    next.set(name, specifiers);
    return next;
}

function packageSpecifiersFor(
    resource: AnalyzedBundleResource,
    sourceFilesByPath: SourceFileByPath
): ReadonlyMap<string, ReadonlySet<string>> {
    let specifiersByName: ReadonlyMap<string, ReadonlySet<string>> = new Map();
    const sourceFile = sourceFilesByPath.get(resource.fileDescription.sourceFilePath);
    if (sourceFile === undefined) {
        return specifiersByName;
    }
    for (const specifier of collectImportSpecifiers(sourceFile)) {
        if (isPackageSpecifier(specifier)) {
            specifiersByName = addPackageSpecifier(specifiersByName, specifier);
        }
    }
    return specifiersByName;
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
    if (!isCodeTargetPath(resource.fileDescription.targetFilePath)) {
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
): ReadonlyMap<string, ReadonlyMap<string, ReadonlySet<string>>> {
    return new Map(contents.map(function (resource) {
        return [ resource.fileDescription.sourceFilePath, packageSpecifiersFor(resource, sourceFilesByPath) ];
    }));
}

function legacyDependencyReference(dependency: Dependency, sourceFilePath: string): DependencyReference {
    return {
        sourceFilePath,
        sourceSpecifier: dependency.name,
        emittedSpecifier: dependency.name
    };
}

function legacyDependencyReferences(
    dependency: Dependency
): readonly [DependencyReference, ...(readonly DependencyReference[])] {
    const [ sourceFilePath, ...rest ] = dependency.referencedFrom;
    return [
        legacyDependencyReference(dependency, sourceFilePath),
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
    return left.sourceFilePath === right.sourceFilePath &&
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

function mergeDependencySourcePaths(
    dependency: Dependency,
    reference: DependencyReference
): readonly [string, ...(readonly string[])] {
    const sourcePaths = new Set([ ...dependency.referencedFrom, reference.sourceFilePath ]);
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
            referencedFrom: [ reference.sourceFilePath ],
            references: [ reference ]
        });
        return;
    }
    dependencies.set(dependencyName, {
        name: dependencyName,
        referencedFrom: mergeDependencySourcePaths(dependency, reference),
        references: mergeDependencyReferences(dependency, reference)
    });
}

function shouldPreserveDependencyReference(
    dependency: Dependency,
    reference: DependencyReference,
    packagesByPath: ReadonlyMap<string, ReadonlyMap<string, ReadonlySet<string>>>,
    preservedReferencePaths: ReadonlySet<string>
): boolean {
    if (preservedReferencePaths.has(reference.sourceFilePath)) {
        return true;
    }
    const emittedSpecifiers = packagesByPath.get(reference.sourceFilePath)?.get(dependency.name);
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

export function indexSourceFiles(loaded: LoadedBundle): SourceFileByPath {
    return new Map(loaded.fileBindings.map(function (binding) {
        return [ binding.sourceFilePath, binding.sourceFile ];
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
