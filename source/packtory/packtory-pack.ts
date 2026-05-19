/* eslint-disable import/max-dependencies -- the pack orchestrator wires resolve+link, version manager, vendor materializer, and pack emitter */
import { Result } from 'true-myth';
import { safeParse } from '@schema-hub/zod-error-formatter';
import type { PackageJson } from 'type-fest';
import { z } from 'zod/mini';
import type { PackEmitter, PackFormat } from '../pack-emitter/pack-emitter.ts';
import { serializePackageJson } from '../version-manager/manifest/serialize.ts';
import type { VersionManager } from '../version-manager/manager.ts';
import type { VersionedBundleWithManifest } from '../version-manager/versioned-bundle.ts';
import type { ValidConfigWithoutRegistryResult } from '../config/validation.ts';
import type { VendorMaterializer } from '../vendor-materializer/vendor-materializer.ts';
import type { VendorEntry } from '../vendor-materializer/vendor-entry.ts';
import type { ResolvedPackage } from './resolved-package.ts';
import type { InternalResolveAndLinkFailure } from './packtory-resolve.ts';
import type { PackPackageFailure } from './packtory-results.ts';

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

function ensureNoBundleDependencies(target: ResolvedPackage): Result<ResolvedPackage, PackPackageFailure> {
    if (target.resolveOptions.bundleDependencies.length > 0) {
        return Result.err({ type: 'bundle-dependencies-unsupported', packageName: target.name });
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

async function vendorExternalsFor(
    vendorMaterializer: VendorMaterializer,
    target: ResolvedPackage
): Promise<readonly VendorEntry[]> {
    const initialDependencyNames = Array.from(target.analyzedBundle.externalDependencies.keys());
    const materialized = await vendorMaterializer.materializeExternals({
        initialDependencyNames,
        projectFolder: target.resolveOptions.sourcesFolder
    });
    return materialized.entries;
}

type PreparedArtifact = {
    readonly bundle: VersionedBundleWithManifest;
    readonly vendorEntries: readonly VendorEntry[];
};

async function prepareArtifact(
    dependencies: PackRunDependencies,
    target: ResolvedPackage,
    options: PackOptions
): Promise<PreparedArtifact> {
    const built = buildVersionedBundle(dependencies.versionManager, target, options.version);
    if (!options.vendorDependencies) {
        return { bundle: built, vendorEntries: [] };
    }
    const vendorEntries = await vendorExternalsFor(dependencies.vendorMaterializer, target);
    return { bundle: slimManifestForVendoredArtifact(built), vendorEntries };
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

        const targetResult = findPackage(resolveResult.value, options.packageName).andThen(ensureNoBundleDependencies);
        if (targetResult.isErr) {
            return Result.err(targetResult.error);
        }

        const prepared = await prepareArtifact(dependencies, targetResult.value, options);
        await dependencies.packEmitter.pack({
            bundle: prepared.bundle,
            format: options.format,
            outputPath: options.outputPath,
            vendorEntries: prepared.vendorEntries
        });

        return Result.ok(undefined);
    };
}
