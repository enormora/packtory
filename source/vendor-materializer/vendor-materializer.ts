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

export type MaterializedExternals = {
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

type VisitedPackageRegistry = {
    readonly add: (name: string) => unknown;
    readonly has: (name: string) => boolean;
    readonly [Symbol.iterator]: () => IterableIterator<string>;
};

type VendorEntryCollection = {
    readonly push: (...entries: readonly VendorEntry[]) => unknown;
    readonly [Symbol.iterator]: () => IterableIterator<VendorEntry>;
};

type PeerRequirementRegistry = {
    readonly set: (packageName: string, peerDependencyNames: readonly string[]) => unknown;
    readonly [Symbol.iterator]: () => IterableIterator<readonly [string, readonly string[]]>;
};

type Closure = {
    readonly visited: VisitedPackageRegistry;
    readonly entries: VendorEntryCollection;
    readonly pendingPackages: Worklist<QueueItem>;
    readonly peerRequirements: PeerRequirementRegistry;
};

type ParsedManifestSummary = {
    readonly transitiveDependencyNames: readonly string[];
    readonly peerDependencyNames: readonly string[];
};

function parsePackageArgument(name: string): npa.Result | undefined {
    try {
        return npa(name);
    } catch {
        return undefined;
    }
}

function getPackageArgumentName(name: string): string | undefined {
    return parsePackageArgument(name)?.name ?? undefined;
}

function findFirstInvalidDependencyName(names: readonly string[]): string | undefined {
    for (const name of names) {
        if (getPackageArgumentName(name) !== name) {
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
    readonly collected: VendorEntryCollection;
};

async function getResolvedTargetPath(
    walker: FileWalkerDependencies,
    absoluteEntryPath: string
): Promise<Result<string, string>> {
    try {
        return Result.ok(await walker.getRealPath(absoluteEntryPath));
    } catch {
        return Result.err(absoluteEntryPath);
    }
}

function isPathInsideRoot(rootDirectory: string, candidatePath: string): boolean {
    const normalizedRoot = path.resolve(rootDirectory);
    const normalizedCandidate = path.resolve(candidatePath);
    return normalizedCandidate === normalizedRoot || normalizedCandidate.startsWith(`${normalizedRoot}${path.sep}`);
}

async function checkSymlinkInsidePackage(
    walker: FileWalkerDependencies,
    rootDirectory: string,
    packageName: string,
    relativeEntryPath: string
): Promise<Result<undefined, SymlinkTargetOutsidePackageFailure>> {
    const absoluteEntryPath = path.join(rootDirectory, relativeEntryPath);
    const normalizedEntryRelativePath = relativeEntryPath.split(path.sep).join('/');
    const resolvedTarget = await getResolvedTargetPath(walker, absoluteEntryPath);
    const resolvedTargetPath = resolvedTarget.isOk ? resolvedTarget.value : resolvedTarget.error;
    if (resolvedTarget.isErr) {
        return Result.err({
            type: vendorMaterializerFailureType.symlinkTargetOutsidePackage,
            packageName,
            entryRelativePath: normalizedEntryRelativePath,
            resolvedTargetPath
        });
    }
    if (!isPathInsideRoot(rootDirectory, resolvedTargetPath)) {
        return Result.err({
            type: vendorMaterializerFailureType.symlinkTargetOutsidePackage,
            packageName,
            entryRelativePath: normalizedEntryRelativePath,
            resolvedTargetPath
        });
    }

    return Result.ok(undefined);
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

const walkPackageDirectory = async function (
    walker: FileWalkerDependencies,
    state: PackageDirectoryState,
    relativeDirectory: string
): Promise<Result<undefined, SymlinkTargetOutsidePackageFailure>> {
    const absoluteDirectory = path.join(state.packageDirectory.rootDirectory, relativeDirectory);
    const entries = await walker.listDirectoryEntries(absoluteDirectory);

    const collectDirectoryEntry = async function (
        entry: PackageDirectoryEntry
    ): Promise<Result<undefined, SymlinkTargetOutsidePackageFailure>> {
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
            sourcePackageRootPath: state.packageDirectory.rootDirectory,
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
            dependencyNames.map(function (dependencyName) {
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

        return Result.ok(Array.from(collected));
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
            const entries: VendorEntry[] = [];
            const closure: Closure = {
                visited: new Set<string>(),
                entries,
                pendingPackages: createWorklist(
                    options.initialDependencyNames.map(function (name) {
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
                entries: Array.from(closure.entries),
                packageNames: Array.from(closure.visited),
                peerRequirements: new Map(closure.peerRequirements)
            });
        }
    };
}
