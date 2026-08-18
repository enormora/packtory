import path from 'node:path';
import { Result } from 'true-myth';
import type { FileManager } from '../file-manager/file-manager.ts';
import type { ValidConfigWithoutRegistryResult } from '../config/validation.ts';
import type { ResolvedPackage } from './resolved-package.ts';
import { packPackageFailureType, type PackPackageFailure } from './packtory-results.ts';

type PackOutputDependencies = {
    readonly fileManager: Pick<FileManager, 'checkDirectory' | 'checkReadability'>;
};

export type BatchOutputTarget = {
    readonly packageName: string;
    readonly outputPath: string;
};

type SingleOutputOptions = {
    readonly format: string;
    readonly outputPath: string;
};

type BatchOutputOptions = {
    readonly outputPath: string;
};

function isSafeOutputSegment(segment: string): boolean {
    return segment.length > 0 && segment !== '.' && segment !== '..' && !segment.includes('\\');
}

function batchOutputTarget(
    outputRoot: string,
    packageName: string
): Result<BatchOutputTarget, PackPackageFailure> {
    const segments = packageName.split('/');
    const outputPath = path.join(outputRoot, ...segments);
    if (!segments.every(isSafeOutputSegment)) {
        return Result.err({ type: packPackageFailureType.unsafeOutputFolder, packageName, outputPath });
    }

    return Result.ok({ packageName, outputPath });
}

async function preflightFolderOutput(
    dependencies: PackOutputDependencies,
    packageName: string,
    outputPath: string
): Promise<Result<undefined, PackPackageFailure>> {
    const readability = await dependencies.fileManager.checkReadability(outputPath);
    if (readability.isReadable) {
        return Result.err({ type: packPackageFailureType.outputFolderExists, packageName, outputPath });
    }

    return Result.ok(undefined);
}

async function preflightBatchRoot(
    dependencies: PackOutputDependencies,
    outputPath: string
): Promise<Result<undefined, PackPackageFailure>> {
    const directory = await dependencies.fileManager.checkDirectory(outputPath);
    if (directory.exists && !directory.isDirectory) {
        return Result.err({ type: packPackageFailureType.outputRootNotDirectory, outputPath });
    }

    return Result.ok(undefined);
}

export async function preflightSingleOutput(
    dependencies: PackOutputDependencies,
    target: ResolvedPackage,
    options: SingleOutputOptions
): Promise<Result<undefined, PackPackageFailure>> {
    if (options.format !== 'folder') {
        return Result.ok(undefined);
    }

    return preflightFolderOutput(dependencies, target.name, options.outputPath);
}

async function preflightBatchOutputTarget(
    dependencies: PackOutputDependencies,
    outputRoot: string,
    packageName: string
): Promise<Result<BatchOutputTarget, PackPackageFailure>> {
    const targetResult = batchOutputTarget(outputRoot, packageName);
    if (targetResult.isErr) {
        return Result.err(targetResult.error);
    }

    const outputPreflight = await preflightFolderOutput(dependencies, packageName, targetResult.value.outputPath);
    if (outputPreflight.isErr) {
        return Result.err(outputPreflight.error);
    }

    return Result.ok(targetResult.value);
}

export async function preflightBatchOutputs(
    dependencies: PackOutputDependencies,
    validated: ValidConfigWithoutRegistryResult,
    options: BatchOutputOptions
): Promise<Result<readonly BatchOutputTarget[], PackPackageFailure>> {
    const rootPreflight = await preflightBatchRoot(dependencies, options.outputPath);
    if (rootPreflight.isErr) {
        return Result.err(rootPreflight.error);
    }

    const targets: BatchOutputTarget[] = [];
    for (const packageConfig of validated.packtoryConfig.packages) {
        const targetResult = await preflightBatchOutputTarget(dependencies, options.outputPath, packageConfig.name);
        if (targetResult.isErr) {
            return Result.err(targetResult.error);
        }

        targets.push(targetResult.value);
    }

    return Result.ok(targets);
}
