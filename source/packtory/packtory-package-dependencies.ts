import path from 'node:path';
import type { ValidConfigWithoutRegistryResult } from '../config/validation.ts';
import type { DependencyReference, ExternalDependency } from '../dependency-scanner/external-dependencies.ts';
import { classifySpecifier } from '../version-manager/specifier-classifier.ts';
import type { PackageAnalysisDependencies } from './stages/package-analysis-stage.ts';
import type { PackageResolutionDependencies } from './stages/package-resolution-stage.ts';
import { inspectResolvedPackageFor } from './packtory-package-inspection.ts';
import type {
    PackageDependency,
    PackageDependencyGroup,
    PackageDependencyInspection,
    PackageDependencyInspectionResult,
    PackageDependencyManifestState,
    PackageDependencyOrigin
} from './packtory-results.ts';
import type { ResolvedPackage } from './resolved-package.ts';

type PackageDependencyInspectionDependencies = PackageAnalysisDependencies & PackageResolutionDependencies & {
    readonly repositoryFolder: string;
};

type ManifestInput = {
    readonly group: PackageDependencyGroup;
    readonly version: string;
};

type DependencyInput = {
    readonly dependency: ExternalDependency;
    readonly manifest: ManifestInput | undefined;
    readonly origin: PackageDependencyOrigin;
};

function sourcePath(repositoryFolder: string, sourceFilePath: string): string {
    return path.relative(repositoryFolder, sourceFilePath).split(path.sep).join(path.posix.sep);
}

function legacyReferences(dependency: ExternalDependency): readonly DependencyReference[] {
    return dependency.referencedFrom.map(function (sourceFilePath) {
        return {
            sourceFilePath,
            sourceSpecifier: dependency.name,
            emittedSpecifier: dependency.name
        };
    });
}

function dependencyReferences(dependency: ExternalDependency): readonly DependencyReference[] {
    return dependency.references ?? legacyReferences(dependency);
}

function renderInvalidSpecifierMessage(
    classification: Exclude<ReturnType<typeof classifySpecifier>, { readonly kind: 'registry'; }>
): string {
    if (classification.kind === 'malformed') {
        return classification.reason;
    }
    return `Mutable ${classification.npaType} dependency specifier is not allowed`;
}

function manifestState(
    manifest: ManifestInput | undefined,
    allowMutableSpecifiers: readonly string[],
    dependencyName: string
): PackageDependencyManifestState {
    if (manifest === undefined) {
        return { type: 'missing-version' };
    }
    const classification = classifySpecifier(dependencyName, manifest.version);
    if (classification.kind === 'registry' || allowMutableSpecifiers.includes(dependencyName)) {
        return { type: 'emitted', group: manifest.group, version: manifest.version };
    }
    return {
        type: 'invalid-version',
        group: manifest.group,
        version: manifest.version,
        message: renderInvalidSpecifierMessage(classification)
    };
}

function externalDependencyInput(
    dependency: ExternalDependency,
    mainPackageJson: ResolvedPackage['resolveOptions']['mainPackageJson']
): DependencyInput {
    const peerVersion = mainPackageJson.peerDependencies?.[dependency.name];
    if (peerVersion !== undefined) {
        return {
            dependency,
            manifest: { group: 'peerDependencies', version: peerVersion },
            origin: 'external'
        };
    }
    const dependencyVersion = mainPackageJson.dependencies?.[dependency.name];
    if (dependencyVersion !== undefined) {
        return {
            dependency,
            manifest: { group: 'dependencies', version: dependencyVersion },
            origin: 'external'
        };
    }
    return { dependency, manifest: undefined, origin: 'external' };
}

function bundleDependencyInput(
    dependency: ExternalDependency,
    bundlePeerDependencyNames: ReadonlySet<string>
): DependencyInput {
    const isPeer = bundlePeerDependencyNames.has(dependency.name);
    return {
        dependency,
        manifest: {
            group: isPeer ? 'peerDependencies' : 'dependencies',
            version: '0.0.0'
        },
        origin: isPeer ? 'bundle-peer' : 'bundle'
    };
}

function toPackageDependency(
    input: DependencyInput,
    repositoryFolder: string,
    allowMutableSpecifiers: readonly string[]
): PackageDependency {
    return {
        name: input.dependency.name,
        origin: input.origin,
        manifest: manifestState(input.manifest, allowMutableSpecifiers, input.dependency.name),
        references: dependencyReferences(input.dependency)
            .map(function (reference) {
                return {
                    sourcePath: sourcePath(repositoryFolder, reference.sourceFilePath),
                    sourceSpecifier: reference.sourceSpecifier,
                    emittedSpecifier: reference.emittedSpecifier
                };
            })
            .toSorted(function (left, right) {
                const sourcePathComparison = left.sourcePath.localeCompare(right.sourcePath);
                const sourceSpecifierComparison = left.sourceSpecifier.localeCompare(right.sourceSpecifier);
                const emittedSpecifierComparison = left.emittedSpecifier.localeCompare(right.emittedSpecifier);
                if (sourcePathComparison === 0 && sourceSpecifierComparison === 0) {
                    return emittedSpecifierComparison;
                }
                return sourcePathComparison === 0 ? sourceSpecifierComparison : sourcePathComparison;
            })
    };
}

function inspectResolvedPackage(
    dependencies: PackageDependencyInspectionDependencies,
    target: ResolvedPackage
): PackageDependencyInspection {
    const bundlePeerDependencyNames = new Set(target.resolveOptions.bundlePeerDependencies.map(function (dependency) {
        return dependency.name;
    }));
    const externalInputs = Array.from(target.analyzedBundle.externalDependencies.values(), function (dependency) {
        return externalDependencyInput(dependency, target.resolveOptions.mainPackageJson);
    });
    const bundleInputs = Array.from(target.analyzedBundle.linkedBundleDependencies.values(), function (dependency) {
        return bundleDependencyInput(dependency, bundlePeerDependencyNames);
    });

    return {
        packageName: target.name,
        dependencies: [ ...externalInputs, ...bundleInputs ]
            .map(function (input) {
                return toPackageDependency(
                    input,
                    dependencies.repositoryFolder,
                    target.resolveOptions.allowMutableSpecifiers
                );
            })
            .toSorted(function (left, right) {
                const nameComparison = left.name.localeCompare(right.name);
                return nameComparison === 0 ? left.origin.localeCompare(right.origin) : nameComparison;
            })
    };
}

export function createInspectPackageDependenciesValidated(
    dependencies: PackageDependencyInspectionDependencies
): (
    validated: ValidConfigWithoutRegistryResult,
    packageName: string
) => Promise<PackageDependencyInspectionResult> {
    return async function inspectPackageDependenciesValidated(validated, packageName) {
        return await inspectResolvedPackageFor(dependencies, validated, packageName, function (target) {
            return inspectResolvedPackage(dependencies, target);
        });
    };
}
