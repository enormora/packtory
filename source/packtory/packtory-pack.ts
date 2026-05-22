import { Result } from 'true-myth';
import type { PackEmitter, PackFormat } from '../pack-emitter/pack-emitter.ts';
import type { VersionManager } from '../version-manager/manager.ts';
import type { ValidConfigWithoutRegistryResult } from '../config/validation.ts';
import type { ResolvedPackage } from './resolved-package.ts';
import type { InternalResolveAndLinkFailure } from './packtory-resolve.ts';
import type { PackPackageFailure } from './packtory-results.ts';

export type PackOptions = {
    readonly packageName: string;
    readonly format: PackFormat;
    readonly outputPath: string;
    readonly version: string;
};

export type InternalPackFailure = InternalResolveAndLinkFailure | PackPackageFailure;

type ResolveAndLinkAllValidated = (
    config: ValidConfigWithoutRegistryResult
) => Promise<Result<readonly ResolvedPackage[], InternalResolveAndLinkFailure>>;

export type PackRunDependencies = {
    readonly versionManager: VersionManager;
    readonly packEmitter: PackEmitter;
};

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

        const target = targetResult.value;
        const versionedBundle = dependencies.versionManager.addVersion({
            bundle: target.analyzedBundle,
            version: options.version,
            mainPackageJson: target.resolveOptions.mainPackageJson,
            bundleDependencies: [],
            bundlePeerDependencies: [],
            additionalPackageJsonAttributes: target.resolveOptions.additionalPackageJsonAttributes,
            allowMutableSpecifiers: target.resolveOptions.allowMutableSpecifiers
        });

        await dependencies.packEmitter.pack({
            bundle: versionedBundle,
            format: options.format,
            outputPath: options.outputPath
        });

        return Result.ok(undefined);
    };
}
