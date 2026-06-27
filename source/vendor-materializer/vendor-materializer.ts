import path from 'node:path';
import npa from 'npm-package-arg';
import { Result } from 'true-myth';
import { z } from 'zod/mini';
import { safeParse } from '../common/schema-validation.ts';
import {
    ancestorInstalledDependencyPathCandidates,
    bundledInstalledDependencyPath,
    installedDependenciesFolderName,
    packageManifestPathIn
} from '../common/package-layout.ts';
import { createWorklist, type Worklist } from '../common/worklist.ts';
import type { FileManager } from '../file-manager/file-manager.ts';
import type { VendorEntry } from './vendor-entry.ts';

export const vendorMaterializerFailureType = {
    invalidDependencyName: 'invalid-dependency-name',
    symlinkTargetOutsidePackage: 'symlink-target-outside-package'
} as const;

type SymlinkTargetOutsidePackageFailure = {
    readonly type: typeof vendorMaterializerFailureType.symlinkTargetOutsidePackage;
    readonly packageName: string;
    readonly entryRelativePath: string;
    readonly resolvedTargetPath: string;
};

type InvalidDependencyNameFailure = {
    readonly type: typeof vendorMaterializerFailureType.invalidDependencyName;
    readonly sourcePackageName: string | undefined;
    readonly invalidDependencyName: string;
};

export type VendorMaterializerFailure = InvalidDependencyNameFailure | SymlinkTargetOutsidePackageFailure;

type MaterializedExternals = {
    readonly entries: readonly VendorEntry[];
    readonly packageNames: readonly string[];
    readonly peerRequirements: ReadonlyMap<string, readonly string[]>;
};

export type VendorMaterializerDependencies = {
    readonly fileManager: Pick<FileManager, 'checkReadability' | 'getRealPath' | 'listDirectoryEntries' | 'readFile'>;
};

type MaterializeExternalsOptions = {
    readonly initialDependencyNames: readonly string[];
    readonly projectFolder: string;
};

export type VendorMaterializer = {
    materializeExternals: (
        options: MaterializeExternalsOptions
    ) => Promise<Result<MaterializedExternals, VendorMaterializerFailure>>;
};
const dependencyMapSchema = z.optional(z.record(z.string(), z.string()));

function packageManifestSchema(): z.ZodMiniType<{
    readonly dependencies?: Readonly<Record<string, string>> | undefined;
    readonly peerDependencies?: Readonly<Record<string, string>> | undefined;
}> {
    return z.object({
        dependencies: dependencyMapSchema,
        peerDependencies: dependencyMapSchema
    });
}

type QueueItem = {
    readonly name: string;
    readonly fromFolder: string;
};

type Closure = {
    readonly visited: Set<string>;
    readonly entries: VendorEntry[];
    readonly pendingPackages: Worklist<QueueItem>;
    readonly peerRequirements: Map<string, readonly string[]>;
};

type ParsedManifestSummary = {
    readonly transitiveDependencyNames: readonly string[];
    readonly peerDependencyNames: readonly string[];
};

function findFirstInvalidDependencyName(names: readonly string[]): string | undefined {
    for (const name of names) {
        try {
            if (npa(name).name !== name) {
                return name;
            }
        } catch {
            return name;
        }
    }
    return undefined;
}

function parseManifestSummary(
    sourcePackageName: string,
    content: string
): Result<ParsedManifestSummary, InvalidDependencyNameFailure> {
    const parsed = safeParse(packageManifestSchema(), JSON.parse(content));
    if (!parsed.success) {
        return Result.ok({ transitiveDependencyNames: [], peerDependencyNames: [] });
    }
    const dependencyNames = Object.keys(parsed.data.dependencies ?? {});
    const peerDependencyNames = Object.keys(parsed.data.peerDependencies ?? {});
    const transitiveDependencyNames = dependencyNames.concat(peerDependencyNames);
    const invalidDependencyName = findFirstInvalidDependencyName(transitiveDependencyNames);
    if (invalidDependencyName !== undefined) {
        return Result.err({
            type: vendorMaterializerFailureType.invalidDependencyName,
            sourcePackageName,
            invalidDependencyName
        });
    }
    return Result.ok({
        transitiveDependencyNames,
        peerDependencyNames
    });
}

type FileWalkerDependencies = Pick<FileManager, 'getRealPath' | 'listDirectoryEntries'>;
type PackageDirectoryEntry = Awaited<ReturnType<FileWalkerDependencies['listDirectoryEntries']>>[number];
type PackageDirectoryWalk = {
    readonly rootDirectory: string;
    readonly packageName: string;
};
type PackageDirectoryState = {
    readonly packageDirectory: PackageDirectoryWalk;
    readonly collected: VendorEntry[];
};

async function checkSymlinkInsidePackage(
    walker: FileWalkerDependencies,
    rootDirectory: string,
    packageName: string,
    relativeEntryPath: string
): Promise<Result<undefined, SymlinkTargetOutsidePackageFailure>> {
    const absoluteEntryPath = path.join(rootDirectory, relativeEntryPath);
    const normalizedEntryRelativePath = relativeEntryPath.split(path.sep).join('/');
    try {
        const resolvedTargetPath = await walker.getRealPath(absoluteEntryPath);
        const normalizedRoot = path.resolve(rootDirectory);
        const normalizedCandidate = path.resolve(resolvedTargetPath);
        if (normalizedCandidate !== normalizedRoot && !normalizedCandidate.startsWith(`${normalizedRoot}${path.sep}`)) {
            return Result.err({
                type: vendorMaterializerFailureType.symlinkTargetOutsidePackage,
                packageName,
                entryRelativePath: normalizedEntryRelativePath,
                resolvedTargetPath
            });
        }
        return Result.ok(undefined);
    } catch {
        return Result.err({
            type: vendorMaterializerFailureType.symlinkTargetOutsidePackage,
            packageName,
            entryRelativePath: normalizedEntryRelativePath,
            resolvedTargetPath: absoluteEntryPath
        });
    }
}

async function validatePackageDirectoryEntry(
    walker: FileWalkerDependencies,
    packageDirectory: PackageDirectoryWalk,
    relativeEntryPath: string,
    entry: PackageDirectoryEntry
): Promise<Result<undefined, SymlinkTargetOutsidePackageFailure>> {
    if (!entry.isSymbolicLink) {
        return Result.ok(undefined);
    }

    return checkSymlinkInsidePackage(
        walker,
        packageDirectory.rootDirectory,
        packageDirectory.packageName,
        relativeEntryPath
    );
}

const walkPackageDirectory = async (
    walker: FileWalkerDependencies,
    state: PackageDirectoryState,
    relativeDirectory: string
): Promise<Result<undefined, SymlinkTargetOutsidePackageFailure>> => {
    const absoluteDirectory = path.join(state.packageDirectory.rootDirectory, relativeDirectory);
    const entries = await walker.listDirectoryEntries(absoluteDirectory);

    const collectDirectoryEntry = async (
        entry: PackageDirectoryEntry
    ): Promise<Result<undefined, SymlinkTargetOutsidePackageFailure>> => {
        if (entry.name === installedDependenciesFolderName) {
            return Result.ok(undefined);
        }

        const relativeEntryPath = path.join(relativeDirectory, entry.name);
        const symlinkCheck = await validatePackageDirectoryEntry(
            walker,
            state.packageDirectory,
            relativeEntryPath,
            entry
        );
        if (symlinkCheck.isErr) {
            return symlinkCheck;
        }

        if (entry.isDirectory) {
            return walkPackageDirectory(walker, state, relativeEntryPath);
        }

        state.collected.push({
            sourceAbsolutePath: path.join(state.packageDirectory.rootDirectory, relativeEntryPath),
            targetRelativePath: bundledInstalledDependencyPath(state.packageDirectory.packageName, relativeEntryPath),
            isExecutable: false
        });
        return Result.ok(undefined);
    };

    for (const entry of entries) {
        const result = await collectDirectoryEntry(entry);
        if (result.isErr) {
            return result;
        }
    }

    return Result.ok(undefined);
};

export function createVendorMaterializer(dependencies: VendorMaterializerDependencies): VendorMaterializer {
    const { fileManager } = dependencies;

    function scheduleTransitiveDependencies(
        closure: Closure,
        fromFolder: string,
        dependencyNames: readonly string[]
    ): void {
        closure.pendingPackages.scheduleAll(
            dependencyNames.map((dependencyName) => {
                return { name: dependencyName, fromFolder };
            })
        );
    }

    async function collectVendorEntries(
        packageName: string,
        realPath: string
    ): Promise<Result<readonly VendorEntry[], SymlinkTargetOutsidePackageFailure>> {
        const collected: VendorEntry[] = [];
        const walkResult = await walkPackageDirectory(
            fileManager,
            { packageDirectory: { rootDirectory: realPath, packageName }, collected },
            ''
        );
        if (walkResult.isErr) {
            return Result.err(walkResult.error);
        }

        return Result.ok(collected);
    }

    async function readManifestSummary(
        packageName: string,
        realPath: string
    ): Promise<Result<ParsedManifestSummary, InvalidDependencyNameFailure>> {
        const manifestPath = packageManifestPathIn(realPath);
        const content = await fileManager.readFile(manifestPath);
        return parseManifestSummary(packageName, content);
    }

    async function findPackageRealPath(packageName: string, startFolder: string): Promise<string | undefined> {
        for (const candidatePath of ancestorInstalledDependencyPathCandidates(startFolder, packageName)) {
            const readability = await fileManager.checkReadability(candidatePath);
            if (readability.isReadable) {
                return await fileManager.getRealPath(candidatePath);
            }
        }
        return undefined;
    }

    async function ingestResolvedPackage(
        closure: Closure,
        name: string,
        realPath: string
    ): Promise<Result<undefined, VendorMaterializerFailure>> {
        const summaryResult = await readManifestSummary(name, realPath);
        if (summaryResult.isErr) {
            return Result.err(summaryResult.error);
        }

        scheduleTransitiveDependencies(closure, realPath, summaryResult.value.transitiveDependencyNames);
        closure.peerRequirements.set(name, summaryResult.value.peerDependencyNames);
        const collectedResult = await collectVendorEntries(name, realPath);
        if (collectedResult.isErr) {
            return Result.err(collectedResult.error);
        }

        closure.entries.push(...collectedResult.value);
        return Result.ok(undefined);
    }

    async function processPendingPackageItem(
        closure: Closure,
        item: QueueItem
    ): Promise<Result<undefined, VendorMaterializerFailure>> {
        if (closure.visited.has(item.name)) {
            return Result.ok(undefined);
        }

        const realPath = await findPackageRealPath(item.name, item.fromFolder);
        if (realPath === undefined) {
            return Result.ok(undefined);
        }

        closure.visited.add(item.name);
        return ingestResolvedPackage(closure, item.name, realPath);
    }

    async function drainPendingPackages(closure: Closure): Promise<Result<undefined, VendorMaterializerFailure>> {
        for (
            let item = closure.pendingPackages.takeNext();
            item !== undefined;
            item = closure.pendingPackages.takeNext()
        ) {
            const processed = await processPendingPackageItem(closure, item);
            if (processed.isErr) {
                return processed;
            }
        }

        return Result.ok(undefined);
    }

    return {
        async materializeExternals(options) {
            const invalidInitialName = findFirstInvalidDependencyName(options.initialDependencyNames);
            if (invalidInitialName !== undefined) {
                return Result.err({
                    type: vendorMaterializerFailureType.invalidDependencyName,
                    sourcePackageName: undefined,
                    invalidDependencyName: invalidInitialName
                });
            }
            const closure: Closure = {
                visited: new Set<string>(),
                entries: [],
                pendingPackages: createWorklist(
                    options.initialDependencyNames.map((name) => {
                        return { name, fromFolder: options.projectFolder };
                    })
                ),
                peerRequirements: new Map<string, readonly string[]>()
            };
            const drained = await drainPendingPackages(closure);
            if (drained.isErr) {
                return Result.err(drained.error);
            }
            return Result.ok({
                entries: closure.entries,
                packageNames: Array.from(closure.visited),
                peerRequirements: closure.peerRequirements
            });
        }
    };
}
