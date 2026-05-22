/* eslint-disable import/max-dependencies -- the pack orchestrator wires resolve+link, version manager, vendor materializer, and pack emitter */
import { Result } from 'true-myth';
import { safeParse } from '@schema-hub/zod-error-formatter';
import type { PackageJson } from 'type-fest';
import { z } from 'zod/mini';
import type { FileDescription } from '../file-manager/file-description.ts';
import type { PackEmitter, PackFormat } from '../pack-emitter/pack-emitter.ts';
import { serializePackageJson } from '../version-manager/manifest/serialize.ts';
import type { VersionManager } from '../version-manager/manager.ts';
import type { VersionedBundleWithManifest } from '../version-manager/versioned-bundle.ts';
import type { ValidConfigWithoutRegistryResult } from '../config/validation.ts';
import type {
    InvalidDependencyNameFailure,
    SymlinkTargetOutsidePackageFailure,
    VendorMaterializer,
    VendorMaterializerFailure
} from '../vendor-materializer/vendor-materializer.ts';
import type { VendorEntry } from '../vendor-materializer/vendor-entry.ts';
import type { ResolvedPackage } from './resolved-package.ts';
import type { InternalResolveAndLinkFailure } from './packtory-resolve.ts';
import type { PackPackageFailure, UnsatisfiedPeerDependency } from './packtory-results.ts';

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
const nodeModulesFolderName = 'node_modules';

function findPackage(
    resolved: readonly ResolvedPackage[],
    packageName: string
): Result<ResolvedPackage, PackPackageFailure> {
    const target = resolved.find((resolvedPackage) => {
        return resolvedPackage.name === packageName;
    });
    if (target === undefined) {
        return Result.err({ type: 'package-not-found', packageName });
    }
    return Result.ok(target);
}

function stripVendoredManifestFields(manifest: Readonly<Record<string, unknown>>): Record<string, unknown> {
    const slim: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(manifest)) {
        if (key !== 'dependencies' && key !== 'peerDependencies') {
            slim[key] = value;
        }
    }
    return slim;
}

function asPackageJson(record: Readonly<Record<string, unknown>>): PackageJson {
    // serializePackageJson sorts and stringifies any plain object; the PackageJson cast keeps
    // the public seam without forcing every test fixture through type-fest's deep type.
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- structural compat
    return record as PackageJson;
}

function slimManifestForVendoredArtifact(bundle: VersionedBundleWithManifest): VersionedBundleWithManifest {
    const parsed = safeParse(manifestSchema, JSON.parse(bundle.manifestFile.content));
    if (!parsed.success) {
        return bundle;
    }
    const content = serializePackageJson(asPackageJson(stripVendoredManifestFields(parsed.data)));
    return {
        ...bundle,
        manifestFile: { ...bundle.manifestFile, content }
    };
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

function bundleDependencyAsExtraFiles(versioned: VersionedBundleWithManifest): readonly FileDescription[] {
    const prefix = `${nodeModulesFolderName}/${versioned.name}`;
    const manifest: FileDescription = {
        filePath: `${prefix}/${versioned.manifestFile.filePath}`,
        content: versioned.manifestFile.content,
        isExecutable: versioned.manifestFile.isExecutable
    };
    const sources = versioned.contents.map((entry) => {
        return {
            filePath: `${prefix}/${entry.fileDescription.targetFilePath}`,
            content: entry.fileDescription.content,
            isExecutable: entry.fileDescription.isExecutable
        };
    });
    return [manifest, ...sources];
}

type BundleDepClosure = {
    readonly extraFiles: readonly FileDescription[];
    readonly packageNames: ReadonlySet<string>;
    readonly peerRequirements: ReadonlyMap<string, readonly string[]>;
};

type BundleDepClosureBuilder = {
    readonly extraFiles: FileDescription[];
    readonly packageNames: Set<string>;
    readonly peerRequirements: Map<string, readonly string[]>;
    readonly resolvedByName: ReadonlyMap<string, ResolvedPackage>;
};

function recordVisitedBundleDependency(
    builder: BundleDepClosureBuilder,
    versionManager: VersionManager,
    fallbackVersion: string,
    pkg: ResolvedPackage
): void {
    builder.packageNames.add(pkg.name);
    const versioned = buildVersionedBundle(versionManager, pkg, fallbackVersion);
    builder.extraFiles.push(...bundleDependencyAsExtraFiles(versioned));
    builder.peerRequirements.set(pkg.name, Object.keys(versioned.peerDependencies));
}

function visitBundleDependency(
    builder: BundleDepClosureBuilder,
    versionManager: VersionManager,
    fallbackVersion: string,
    name: string
): void {
    if (builder.packageNames.has(name)) {
        return;
    }
    const pkg = builder.resolvedByName.get(name);
    if (pkg === undefined) {
        return;
    }
    recordVisitedBundleDependency(builder, versionManager, fallbackVersion, pkg);
    for (const transitiveName of pkg.analyzedBundle.linkedBundleDependencies.keys()) {
        visitBundleDependency(builder, versionManager, fallbackVersion, transitiveName);
    }
}

function collectBundleDependencies(
    target: ResolvedPackage,
    resolvedPackages: readonly ResolvedPackage[],
    versionManager: VersionManager,
    fallbackVersion: string
): BundleDepClosure {
    const builder: BundleDepClosureBuilder = {
        extraFiles: [],
        packageNames: new Set<string>(),
        peerRequirements: new Map<string, readonly string[]>(),
        resolvedByName: new Map(
            resolvedPackages.map((resolvedPackage) => {
                return [resolvedPackage.name, resolvedPackage];
            })
        )
    };
    for (const name of target.analyzedBundle.linkedBundleDependencies.keys()) {
        visitBundleDependency(builder, versionManager, fallbackVersion, name);
    }
    return {
        extraFiles: builder.extraFiles,
        packageNames: builder.packageNames,
        peerRequirements: builder.peerRequirements
    };
}

function findUnsatisfiedPeers(
    closurePackageNames: ReadonlySet<string>,
    peerRequirements: ReadonlyMap<string, readonly string[]>
): readonly UnsatisfiedPeerDependency[] {
    const unsatisfied: UnsatisfiedPeerDependency[] = [];
    for (const [packageName, peers] of peerRequirements) {
        for (const peer of peers) {
            if (!closurePackageNames.has(peer)) {
                unsatisfied.push({ packageName, peer });
            }
        }
    }
    return unsatisfied;
}

type VendoredArtifact = {
    readonly bundle: VersionedBundleWithManifest;
    readonly vendorEntries: readonly VendorEntry[];
    readonly extraFiles: readonly FileDescription[];
};

function mergePeerRequirements(
    left: ReadonlyMap<string, readonly string[]>,
    right: ReadonlyMap<string, readonly string[]>
): Map<string, readonly string[]> {
    const merged = new Map<string, readonly string[]>();
    for (const [name, peers] of left) {
        merged.set(name, peers);
    }
    for (const [name, peers] of right) {
        merged.set(name, peers);
    }
    return merged;
}

type VendoredInputs = {
    readonly target: ResolvedPackage;
    readonly resolved: readonly ResolvedPackage[];
    readonly built: VersionedBundleWithManifest;
    readonly version: string;
};

type MaterializedExternalsResult = Awaited<
    ReturnType<PackRunDependencies['vendorMaterializer']['materializeExternals']>
>;

function mapSymlinkFailure(
    packageName: string,
    materializerFailure: SymlinkTargetOutsidePackageFailure
): PackPackageFailure {
    return {
        type: 'vendor-symlink-target-outside-package',
        packageName,
        vendoredPackageName: materializerFailure.packageName,
        entryRelativePath: materializerFailure.entryRelativePath,
        resolvedTargetPath: materializerFailure.resolvedTargetPath
    };
}

function mapInvalidDependencyNameFailure(
    packageName: string,
    materializerFailure: InvalidDependencyNameFailure
): PackPackageFailure {
    return {
        type: 'vendor-invalid-dependency-name',
        packageName,
        sourcePackageName: materializerFailure.sourcePackageName,
        invalidDependencyName: materializerFailure.invalidDependencyName
    };
}

function mapMaterializerFailure(
    packageName: string,
    materializerFailure: VendorMaterializerFailure
): PackPackageFailure {
    if (materializerFailure.type === 'symlink-target-outside-package') {
        return mapSymlinkFailure(packageName, materializerFailure);
    }
    return mapInvalidDependencyNameFailure(packageName, materializerFailure);
}

function checkClosurePeers(
    bundleClosure: BundleDepClosure,
    externals: MaterializedExternalsResult & { readonly isOk: true }
): readonly UnsatisfiedPeerDependency[] {
    const closurePackageNames = new Set<string>([...bundleClosure.packageNames, ...externals.value.packageNames]);
    const allPeerRequirements = mergePeerRequirements(bundleClosure.peerRequirements, externals.value.peerRequirements);
    return findUnsatisfiedPeers(closurePackageNames, allPeerRequirements);
}

async function prepareVendoredArtifact(
    dependencies: PackRunDependencies,
    inputs: VendoredInputs
): Promise<Result<VendoredArtifact, PackPackageFailure>> {
    const { target, resolved, built, version } = inputs;
    const bundleClosure = collectBundleDependencies(target, resolved, dependencies.versionManager, version);
    const materializationResult = await dependencies.vendorMaterializer.materializeExternals({
        initialDependencyNames: Array.from(target.analyzedBundle.externalDependencies.keys()),
        projectFolder: target.resolveOptions.sourcesFolder
    });
    if (materializationResult.isErr) {
        return Result.err(mapMaterializerFailure(target.name, materializationResult.error));
    }
    const unsatisfiedPeers = checkClosurePeers(bundleClosure, materializationResult);
    if (unsatisfiedPeers.length > 0) {
        return Result.err({ type: 'peer-dependencies-unsatisfied', packageName: target.name, items: unsatisfiedPeers });
    }
    return Result.ok({
        bundle: slimManifestForVendoredArtifact(built),
        vendorEntries: materializationResult.value.entries,
        extraFiles: bundleClosure.extraFiles
    });
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
    if (!options.vendorDependencies) {
        if (target.resolveOptions.bundleDependencies.length > 0) {
            return Result.err({ type: 'bundle-dependencies-unsupported', packageName: target.name });
        }
        return Result.ok({ bundle: built, vendorEntries: [], extraFiles: [] });
    }
    return await prepareVendoredArtifact(dependencies, {
        target,
        resolved,
        built,
        version: options.version
    });
}

async function emitPreparedArtifact(
    packEmitter: PackEmitter,
    prepared: PreparedArtifact,
    options: PackOptions
): Promise<void> {
    await packEmitter.pack({
        bundle: prepared.bundle,
        format: options.format,
        outputPath: options.outputPath,
        vendorEntries: prepared.vendorEntries,
        extraFiles: prepared.extraFiles
    });
}

async function packWithResolved(
    dependencies: PackRunDependencies,
    resolved: readonly ResolvedPackage[],
    options: PackOptions
): Promise<Result<undefined, InternalPackFailure>> {
    const targetResult = findPackage(resolved, options.packageName);
    if (targetResult.isErr) {
        return Result.err(targetResult.error);
    }
    const preparedResult = await prepareArtifact(dependencies, targetResult.value, resolved, options);
    if (preparedResult.isErr) {
        return Result.err(preparedResult.error);
    }
    await emitPreparedArtifact(dependencies.packEmitter, preparedResult.value, options);
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
