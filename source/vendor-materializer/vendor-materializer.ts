import path from 'node:path';
import { safeParse } from '@schema-hub/zod-error-formatter';
import { z } from 'zod/mini';
import type { FileManager } from '../file-manager/file-manager.ts';
import type { VendorEntry } from './vendor-entry.ts';

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
    materializeExternals: (options: MaterializeExternalsOptions) => Promise<MaterializedExternals>;
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

    async function collectPackageFiles(rootDirectory: string, packageName: string): Promise<readonly VendorEntry[]> {
        const collected: VendorEntry[] = [];

        async function walk(relativeDirectory: string): Promise<void> {
            const absoluteDirectory = path.join(rootDirectory, relativeDirectory);
            const entries = await fileManager.listDirectoryEntries(absoluteDirectory);
            const includedEntries = entries.filter((entry) => {
                return entry.name !== nodeModulesFolderName;
            });
            for (const entry of includedEntries) {
                const relativeEntryPath = path.join(relativeDirectory, entry.name);
                if (entry.isDirectory) {
                    await walk(relativeEntryPath);
                } else {
                    collected.push(buildVendorEntry(rootDirectory, packageName, relativeEntryPath));
                }
            }
        }

        await walk('');
        return collected;
    }

    async function ingestResolvedPackage(closure: Closure, name: string, realPath: string): Promise<void> {
        closure.visited.add(name);
        const summary = await readManifestSummary(realPath);
        enqueueDependencies(closure, realPath, summary.transitiveDependencyNames);
        closure.peerRequirements.set(name, summary.peerDependencyNames);
        const packageEntries = await collectPackageFiles(realPath, name);
        closure.entries.push(...packageEntries);
    }

    async function processQueueItem(closure: Closure, item: QueueItem): Promise<void> {
        if (closure.visited.has(item.name)) {
            return;
        }
        const realPath = await findPackageRealPath(item.name, item.fromFolder);
        if (realPath === undefined) {
            return;
        }
        await ingestResolvedPackage(closure, item.name, realPath);
    }

    async function drainQueue(closure: Closure): Promise<void> {
        const item = closure.queue.shift();
        if (item === undefined) {
            return;
        }
        await processQueueItem(closure, item);
        await drainQueue(closure);
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
            await drainQueue(closure);
            return {
                entries: closure.entries,
                packageNames: Array.from(closure.visited),
                peerRequirements: closure.peerRequirements
            };
        }
    };
}
