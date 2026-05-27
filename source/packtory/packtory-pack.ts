/* eslint-disable import/max-dependencies -- the pack orchestrator wires resolve+link, version manager, vendor materializer, and pack emitter */
import { Result } from 'true-myth';
import { safeParse } from '@schema-hub/zod-error-formatter';
import { z } from 'zod/mini';
import { bundledInstalledDependencyPath } from '../common/package-layout.ts';
import { packageNameMap } from '../common/package-name-map.ts';
import { serializeStableJson } from '../common/stable-json.ts';
import { createWorklist } from '../common/worklist.ts';
import type { FileDescription } from '../file-manager/file-description.ts';
import type { PackEmitter, PackFormat } from '../pack-emitter/pack-emitter.ts';
import type { VersionManager } from '../version-manager/manager.ts';
import type { VersionedBundleWithManifest } from '../version-manager/versioned-bundle.ts';
import type { ValidConfigWithoutRegistryResult } from '../config/validation.ts';
import {
    vendorMaterializerFailureType,
    type VendorMaterializer,
    type VendorMaterializerFailure
} from '../vendor-materializer/vendor-materializer.ts';
import type { VendorEntry } from '../vendor-materializer/vendor-entry.ts';
import type { ResolvedPackage } from './resolved-package.ts';
import type { InternalResolveAndLinkFailure } from './packtory-resolve.ts';
import { packPackageFailureType, type PackPackageFailure, type UnsatisfiedPeerDependency } from './packtory-results.ts';

export type PackOptions = {
    readonly packageName: string;
    readonly format: PackFormat;
    readonly outputPath: string;
    readonly version: string;
    readonly vendorDependencies: boolean;
};

export type InternalPackFailure = InternalResolveAndLinkFailure | PackPackageFailure;

type ResolveAndLinkAllValidated = (
    config: ValidConfigWithoutRegistryResult
) => Promise<Result<readonly ResolvedPackage[], InternalResolveAndLinkFailure>>;

export type PackRunDependencies = {
    readonly versionManager: VersionManager;
    readonly packEmitter: PackEmitter;
    readonly vendorMaterializer: VendorMaterializer;
};

const manifestSchema = z.record(z.string(), z.unknown());

function shouldPreservePackageJsonArrayOrder(path: readonly string[]): boolean {
    const [topLevelKey] = path;
    return topLevelKey === 'imports' || topLevelKey === 'exports';
}

function buildVersionedBundle(
    versionManager: VersionManager,
    target: ResolvedPackage,
    version: string
): VersionedBundleWithManifest {
    return versionManager.addVersion({
        bundle: target.analyzedBundle,
        version,
        mainPackageJson: target.resolveOptions.mainPackageJson,
        bundleDependencies: [],
        bundlePeerDependencies: [],
        additionalPackageJsonAttributes: target.resolveOptions.additionalPackageJsonAttributes,
        allowMutableSpecifiers: target.resolveOptions.allowMutableSpecifiers
    });
}

type BundleDepClosure = {
    readonly extraFiles: readonly FileDescription[];
    readonly packageNames: ReadonlySet<string>;
    readonly peerRequirements: ReadonlyMap<string, readonly string[]>;
};

type MutableBundleDepClosure = {
    readonly extraFiles: FileDescription[];
    readonly packageNames: Set<string>;
    readonly peerRequirements: Map<string, readonly string[]>;
    readonly pendingDependencyNames: ReturnType<typeof createWorklist<string>>;
};

function appendBundleDependency(
    closure: MutableBundleDepClosure,
    versionManager: VersionManager,
    fallbackVersion: string,
    pkg: ResolvedPackage
): void {
    const versioned = buildVersionedBundle(versionManager, pkg, fallbackVersion);
    closure.packageNames.add(pkg.name);
    closure.extraFiles.push({
        filePath: bundledInstalledDependencyPath(versioned.name, versioned.manifestFile.filePath),
        content: versioned.manifestFile.content,
        isExecutable: versioned.manifestFile.isExecutable
    });
    for (const entry of versioned.contents) {
        closure.extraFiles.push({
            filePath: bundledInstalledDependencyPath(versioned.name, entry.fileDescription.targetFilePath),
            content: entry.fileDescription.content,
            isExecutable: entry.fileDescription.isExecutable
        });
    }
    closure.peerRequirements.set(pkg.name, Object.keys(versioned.peerDependencies));
    closure.pendingDependencyNames.scheduleAll(pkg.analyzedBundle.linkedBundleDependencies.keys());
}

function collectBundleDependencies(
    target: ResolvedPackage,
    resolvedPackages: readonly ResolvedPackage[],
    versionManager: VersionManager,
    fallbackVersion: string
): BundleDepClosure {
    const resolvedByName = new Map(packageNameMap(resolvedPackages));
    const closure: MutableBundleDepClosure = {
        extraFiles: [],
        packageNames: new Set<string>(),
        peerRequirements: new Map<string, readonly string[]>(),
        pendingDependencyNames: createWorklist(target.analyzedBundle.linkedBundleDependencies.keys())
    };

    for (
        let dependencyName = closure.pendingDependencyNames.takeNext();
        dependencyName !== undefined;
        dependencyName = closure.pendingDependencyNames.takeNext()
    ) {
        const pkg = closure.packageNames.has(dependencyName) ? undefined : resolvedByName.get(dependencyName);
        if (pkg !== undefined) {
            appendBundleDependency(closure, versionManager, fallbackVersion, pkg);
        }
    }

    return {
        extraFiles: closure.extraFiles,
        packageNames: closure.packageNames,
        peerRequirements: closure.peerRequirements
    };
}

type VendoredInputs = {
    readonly target: ResolvedPackage;
    readonly resolved: readonly ResolvedPackage[];
    readonly built: VersionedBundleWithManifest;
    readonly version: string;
};

type VendoredClosureCheck = {
    readonly closurePackageNames: ReadonlySet<string>;
    readonly unsatisfiedPeers: readonly UnsatisfiedPeerDependency[];
};

function mapMaterializerFailure(packageName: string, error: VendorMaterializerFailure): PackPackageFailure {
    if (error.type === vendorMaterializerFailureType.symlinkTargetOutsidePackage) {
        return {
            type: packPackageFailureType.vendorSymlinkTargetOutsidePackage,
            packageName,
            vendoredPackageName: error.packageName,
            entryRelativePath: error.entryRelativePath,
            resolvedTargetPath: error.resolvedTargetPath
        };
    }

    return {
        type: packPackageFailureType.vendorInvalidDependencyName,
        packageName,
        sourcePackageName: error.sourcePackageName,
        invalidDependencyName: error.invalidDependencyName
    };
}

function buildUnsatisfiedPeers(
    peerRequirements: ReadonlyMap<string, readonly string[]>,
    closurePackageNames: ReadonlySet<string>
): readonly UnsatisfiedPeerDependency[] {
    const unsatisfiedPeers: UnsatisfiedPeerDependency[] = [];

    for (const [packageName, peers] of peerRequirements) {
        for (const peer of peers) {
            if (!closurePackageNames.has(peer)) {
                unsatisfiedPeers.push({ packageName, peer });
            }
        }
    }

    return unsatisfiedPeers;
}

function buildVendoredClosureCheck(
    bundleClosure: BundleDepClosure,
    materializationResult: Awaited<ReturnType<VendorMaterializer['materializeExternals']>> & { readonly isOk: true }
): VendoredClosureCheck {
    const closurePackageNames = new Set<string>([
        ...bundleClosure.packageNames,
        ...materializationResult.value.packageNames
    ]);
    const allPeerRequirements = new Map<string, readonly string[]>([
        ...bundleClosure.peerRequirements,
        ...materializationResult.value.peerRequirements
    ]);

    return {
        closurePackageNames,
        unsatisfiedPeers: buildUnsatisfiedPeers(allPeerRequirements, closurePackageNames)
    };
}

function stripVendoredManifestFields(manifest: Readonly<Record<string, unknown>>): Record<string, unknown> {
    const slimManifest: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(manifest)) {
        if (key !== 'dependencies' && key !== 'peerDependencies') {
            slimManifest[key] = value;
        }
    }

    return slimManifest;
}

function serializeVendoredManifest(bundle: VersionedBundleWithManifest): string | undefined {
    const parsedManifest = safeParse(manifestSchema, JSON.parse(bundle.manifestFile.content));
    if (!parsedManifest.success) {
        return undefined;
    }

    return serializeStableJson(stripVendoredManifestFields(parsedManifest.data), {
        shouldPreserveArrayOrder: shouldPreservePackageJsonArrayOrder
    });
}

function slimManifestForVendoredArtifact(bundle: VersionedBundleWithManifest): VersionedBundleWithManifest {
    const serializedManifest = serializeVendoredManifest(bundle);
    if (serializedManifest === undefined) {
        return bundle;
    }

    return {
        ...bundle,
        manifestFile: { ...bundle.manifestFile, content: serializedManifest }
    };
}

function prepareVendoredArtifactFailure(
    target: ResolvedPackage,
    unsatisfiedPeers: readonly UnsatisfiedPeerDependency[]
): Result<PreparedArtifact, PackPackageFailure> {
    return Result.err({
        type: packPackageFailureType.peerDependenciesUnsatisfied,
        packageName: target.name,
        items: unsatisfiedPeers
    });
}

function prepareVendoredArtifactSuccess(
    built: VersionedBundleWithManifest,
    bundleClosure: BundleDepClosure,
    materializationResult: Awaited<ReturnType<VendorMaterializer['materializeExternals']>> & { readonly isOk: true }
): Result<PreparedArtifact, PackPackageFailure> {
    return Result.ok({
        bundle: slimManifestForVendoredArtifact(built),
        vendorEntries: materializationResult.value.entries,
        extraFiles: bundleClosure.extraFiles
    });
}

async function prepareVendoredArtifact(
    dependencies: PackRunDependencies,
    inputs: VendoredInputs
): Promise<Result<PreparedArtifact, PackPackageFailure>> {
    const { target, resolved, built, version } = inputs;
    const bundleClosure = collectBundleDependencies(target, resolved, dependencies.versionManager, version);
    const materializationResult = await dependencies.vendorMaterializer.materializeExternals({
        initialDependencyNames: Array.from(target.analyzedBundle.externalDependencies.keys()),
        projectFolder: target.resolveOptions.sourcesFolder
    });
    if (materializationResult.isErr) {
        return Result.err(mapMaterializerFailure(target.name, materializationResult.error));
    }

    const closureCheck = buildVendoredClosureCheck(bundleClosure, materializationResult);
    if (closureCheck.unsatisfiedPeers.length > 0) {
        return prepareVendoredArtifactFailure(target, closureCheck.unsatisfiedPeers);
    }

    return prepareVendoredArtifactSuccess(built, bundleClosure, materializationResult);
}

type PreparedArtifact = {
    readonly bundle: VersionedBundleWithManifest;
    readonly vendorEntries: readonly VendorEntry[];
    readonly extraFiles: readonly FileDescription[];
};

async function prepareArtifact(
    dependencies: PackRunDependencies,
    target: ResolvedPackage,
    resolved: readonly ResolvedPackage[],
    options: PackOptions
): Promise<Result<PreparedArtifact, PackPackageFailure>> {
    const built = buildVersionedBundle(dependencies.versionManager, target, options.version);

    if (options.vendorDependencies) {
        return await prepareVendoredArtifact(dependencies, {
            target,
            resolved,
            built,
            version: options.version
        });
    }

    if (target.resolveOptions.bundleDependencies.length > 0) {
        return Result.err({ type: packPackageFailureType.bundleDependenciesUnsupported, packageName: target.name });
    }

    return Result.ok({ bundle: built, vendorEntries: [], extraFiles: [] });
}

async function packWithResolved(
    dependencies: PackRunDependencies,
    resolved: readonly ResolvedPackage[],
    options: PackOptions
): Promise<Result<undefined, InternalPackFailure>> {
    const target = resolved.find((resolvedPackage) => {
        return resolvedPackage.name === options.packageName;
    });
    if (target === undefined) {
        return Result.err({ type: packPackageFailureType.packageNotFound, packageName: options.packageName });
    }
    const preparedResult = await prepareArtifact(dependencies, target, resolved, options);
    if (preparedResult.isErr) {
        return Result.err(preparedResult.error);
    }
    await dependencies.packEmitter.pack({
        bundle: preparedResult.value.bundle,
        format: options.format,
        outputPath: options.outputPath,
        vendorEntries: preparedResult.value.vendorEntries,
        extraFiles: preparedResult.value.extraFiles
    });
    return Result.ok(undefined);
}

export function createRunPackValidated(
    dependencies: PackRunDependencies
): (
    validated: ValidConfigWithoutRegistryResult,
    options: PackOptions,
    resolveAndLinkAllValidated: ResolveAndLinkAllValidated
) => Promise<Result<undefined, InternalPackFailure>> {
    return async function runPackValidated(validated, options, resolveAndLinkAllValidated) {
        const resolveResult = await resolveAndLinkAllValidated(validated);
        if (resolveResult.isErr) {
            return Result.err(resolveResult.error);
        }
        return await packWithResolved(dependencies, resolveResult.value, options);
    };
}
