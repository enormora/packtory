import path from 'node:path';
import type { FileManager } from '../file-manager/file-manager.ts';

export type VendorEntry = {
    readonly sourceAbsolutePath: string;
    readonly sourcePackageRootPath: string;
    readonly targetRelativePath: string;
    readonly isExecutable: boolean;
};

type VendorEntrySourceValidator = Pick<FileManager, 'getRealPath'>;

function isInFolder(folder: string, candidate: string): boolean {
    const relativePath = path.relative(folder, candidate);
    return !relativePath.startsWith('..') && !path.isAbsolute(relativePath);
}

export async function validateVendorEntrySource(
    validator: VendorEntrySourceValidator,
    entry: VendorEntry
): Promise<void> {
    const rootPath = path.resolve(entry.sourcePackageRootPath);
    const realSourcePath = await validator.getRealPath(entry.sourceAbsolutePath);

    if (!isInFolder(rootPath, path.resolve(realSourcePath))) {
        throw new Error(
            `Vendored file "${entry.sourceAbsolutePath}" resolved outside package root "${entry.sourcePackageRootPath}"`
        );
    }
}

export function applyPrefixToVendorEntry(prefix: string, entry: VendorEntry): VendorEntry {
    return {
        sourceAbsolutePath: entry.sourceAbsolutePath,
        sourcePackageRootPath: entry.sourcePackageRootPath,
        targetRelativePath: `${prefix}/${entry.targetRelativePath}`,
        isExecutable: entry.isExecutable
    };
}
