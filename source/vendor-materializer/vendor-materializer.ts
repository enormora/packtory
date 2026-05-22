import path from 'node:path';
import { safeParse } from '@schema-hub/zod-error-formatter';
import { Result } from 'true-myth';
import { z } from 'zod/mini';
import type { FileManager } from '../file-manager/file-manager.ts';
import type { VendorEntry } from './vendor-entry.ts';

export type SymlinkTargetOutsidePackageFailure = {
    readonly type: 'symlink-target-outside-package';
    readonly packageName: string;
    readonly entryRelativePath: string;
    readonly resolvedTargetPath: string;
};

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
    ) => Promise<Result<MaterializedExternals, SymlinkTargetOutsidePackageFailure>>;
};

const nodeModulesFolderName = 'node_modules';

const dependencyMapSchema = z.optional(z.record(z.string(), z.string()));
const packageManifestSchema = z.object({
    dependencies: dependencyMapSchema,
    peerDependencies: dependencyMapSchema
});

type QueueItem = {
    readonly name: string;
    readonly fromFolder: string;
};

type Closure = {
    readonly visited: Set<string>;
    readonly entries: VendorEntry[];
    readonly queue: QueueItem[];
    readonly peerRequirements: Map<string, readonly string[]>;
};

function ancestorFolders(startFolder: string): readonly string[] {
    const parts = startFolder.split(path.sep);
    return parts.map((_segment, index, allSegments) => {
        const prefixLength = allSegments.length - index;
        const joined = allSegments.slice(0, prefixLength).join(path.sep);
        return joined.length === 0 ? path.sep : joined;
    });
}

function buildVendorEntry(rootDirectory: string, packageName: string, relativePath: string): VendorEntry {
    const normalizedRelative = relativePath.split(path.sep).join('/');
    return {
        sourceAbsolutePath: path.join(rootDirectory, relativePath),
        targetRelativePath: `${nodeModulesFolderName}/${packageName}/${normalizedRelative}`,
        isExecutable: false
    };
}

function enqueueDependencies(closure: Closure, fromFolder: string, dependencyNames: readonly string[]): void {
    for (const dependencyName of dependencyNames) {
        closure.queue.push({ name: dependencyName, fromFolder });
    }
}

type ParsedManifestSummary = {
    readonly transitiveDependencyNames: readonly string[];
    readonly peerDependencyNames: readonly string[];
};

function parseManifestSummary(content: string): ParsedManifestSummary {
    const parsed = safeParse(packageManifestSchema, JSON.parse(content));
    if (!parsed.success) {
        return { transitiveDependencyNames: [], peerDependencyNames: [] };
    }
    const dependencyNames = Object.keys(parsed.data.dependencies ?? {});
    const peerDependencyNames = Object.keys(parsed.data.peerDependencies ?? {});
    return {
        transitiveDependencyNames: [...dependencyNames, ...peerDependencyNames],
        peerDependencyNames
    };
}

function isInside(rootDirectory: string, candidate: string): boolean {
    const relative = path.relative(rootDirectory, candidate);
    if (relative === '') {
        return true;
    }
    if (relative.startsWith(`..${path.sep}`) || relative === '..') {
        return false;
    }
    return !path.isAbsolute(relative);
}

type FileWalkerDependencies = Pick<FileManager, 'getRealPath' | 'listDirectoryEntries'>;

type CollectRequest = {
    readonly rootDirectory: string;
    readonly packageName: string;
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
        if (!isInside(rootDirectory, resolvedTargetPath)) {
            return Result.err({
                type: 'symlink-target-outside-package',
                packageName,
                entryRelativePath: normalizedEntryRelativePath,
                resolvedTargetPath
            });
        }
        return Result.ok(undefined);
    } catch {
        return Result.err({
            type: 'symlink-target-outside-package',
            packageName,
            entryRelativePath: normalizedEntryRelativePath,
            resolvedTargetPath: absoluteEntryPath
        });
    }
}

async function evaluatePackageEntry(
    walker: FileWalkerDependencies,
    request: CollectRequest,
    relativeEntryPath: string,
    entry: { readonly isDirectory: boolean; readonly isSymbolicLink: boolean }
): Promise<Result<{ readonly shouldRecurse: boolean }, SymlinkTargetOutsidePackageFailure>> {
    if (entry.isSymbolicLink) {
        const symlinkCheck = await checkSymlinkInsidePackage(
            walker,
            request.rootDirectory,
            request.packageName,
            relativeEntryPath
        );
        if (symlinkCheck.isErr) {
            return Result.err(symlinkCheck.error);
        }
    }
    if (entry.isDirectory) {
        return Result.ok({ shouldRecurse: true });
    }
    request.collected.push(buildVendorEntry(request.rootDirectory, request.packageName, relativeEntryPath));
    return Result.ok({ shouldRecurse: false });
}

type RecurseFn = (relativeDirectory: string) => Promise<Result<undefined, SymlinkTargetOutsidePackageFailure>>;

async function processSinglePackageEntry(
    context: { readonly walker: FileWalkerDependencies; readonly request: CollectRequest; readonly recurse: RecurseFn },
    relativeEntryPath: string,
    entry: { readonly isDirectory: boolean; readonly isSymbolicLink: boolean }
): Promise<Result<undefined, SymlinkTargetOutsidePackageFailure>> {
    const evaluated = await evaluatePackageEntry(context.walker, context.request, relativeEntryPath, entry);
    if (evaluated.isErr) {
        return Result.err(evaluated.error);
    }
    if (evaluated.value.shouldRecurse) {
        return await context.recurse(relativeEntryPath);
    }
    return Result.ok(undefined);
}

async function walkPackageDirectory(
    walker: FileWalkerDependencies,
    request: CollectRequest,
    relativeDirectory: string
): Promise<Result<undefined, SymlinkTargetOutsidePackageFailure>> {
    const recurse: RecurseFn = async (childDirectory) => {
        return await walkPackageDirectory(walker, request, childDirectory);
    };
    const absoluteDirectory = path.join(request.rootDirectory, relativeDirectory);
    const entries = await walker.listDirectoryEntries(absoluteDirectory);
    const includedEntries = entries.filter((entry) => {
        return entry.name !== nodeModulesFolderName;
    });
    for (const entry of includedEntries) {
        const relativeEntryPath = path.join(relativeDirectory, entry.name);
        const processed = await processSinglePackageEntry({ walker, request, recurse }, relativeEntryPath, entry);
        if (processed.isErr) {
            return processed;
        }
    }
    return Result.ok(undefined);
}

async function collectPackageFiles(
    walker: FileWalkerDependencies,
    rootDirectory: string,
    packageName: string
): Promise<Result<readonly VendorEntry[], SymlinkTargetOutsidePackageFailure>> {
    const collected: VendorEntry[] = [];
    const result = await walkPackageDirectory(walker, { rootDirectory, packageName, collected }, '');
    if (result.isErr) {
        return Result.err(result.error);
    }
    return Result.ok(collected);
}

export function createVendorMaterializer(dependencies: VendorMaterializerDependencies): VendorMaterializer {
    const { fileManager } = dependencies;

    async function probeCandidate(currentFolder: string, packageName: string): Promise<string | undefined> {
        const candidate = path.join(currentFolder, nodeModulesFolderName, packageName);
        const readability = await fileManager.checkReadability(candidate);
        if (readability.isReadable) {
            return await fileManager.getRealPath(candidate);
        }
        return undefined;
    }

    async function findPackageRealPath(packageName: string, startFolder: string): Promise<string | undefined> {
        for (const folder of ancestorFolders(startFolder)) {
            const found = await probeCandidate(folder, packageName);
            if (found !== undefined) {
                return found;
            }
        }
        return undefined;
    }

    async function readManifestSummary(packageDirectory: string): Promise<ParsedManifestSummary> {
        const manifestPath = path.join(packageDirectory, 'package.json');
        const content = await fileManager.readFile(manifestPath);
        return parseManifestSummary(content);
    }

    async function ingestResolvedPackage(
        closure: Closure,
        name: string,
        realPath: string
    ): Promise<Result<undefined, SymlinkTargetOutsidePackageFailure>> {
        closure.visited.add(name);
        const summary = await readManifestSummary(realPath);
        enqueueDependencies(closure, realPath, summary.transitiveDependencyNames);
        closure.peerRequirements.set(name, summary.peerDependencyNames);
        const packageEntries = await collectPackageFiles(fileManager, realPath, name);
        if (packageEntries.isErr) {
            return Result.err(packageEntries.error);
        }
        closure.entries.push(...packageEntries.value);
        return Result.ok(undefined);
    }

    async function processQueueItem(
        closure: Closure,
        item: QueueItem
    ): Promise<Result<undefined, SymlinkTargetOutsidePackageFailure>> {
        if (closure.visited.has(item.name)) {
            return Result.ok(undefined);
        }
        const realPath = await findPackageRealPath(item.name, item.fromFolder);
        if (realPath === undefined) {
            return Result.ok(undefined);
        }
        return await ingestResolvedPackage(closure, item.name, realPath);
    }

    async function drainQueue(closure: Closure): Promise<Result<undefined, SymlinkTargetOutsidePackageFailure>> {
        const item = closure.queue.shift();
        if (item === undefined) {
            return Result.ok(undefined);
        }
        const processed = await processQueueItem(closure, item);
        if (processed.isErr) {
            return processed;
        }
        return await drainQueue(closure);
    }

    return {
        async materializeExternals(options) {
            const closure: Closure = {
                visited: new Set<string>(),
                entries: [],
                queue: options.initialDependencyNames.map((name) => {
                    return { name, fromFolder: options.projectFolder };
                }),
                peerRequirements: new Map<string, readonly string[]>()
            };
            const drained = await drainQueue(closure);
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
