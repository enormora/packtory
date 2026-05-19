import path from 'node:path';
import type { FileDescription } from '../file-manager/file-description.ts';
import type { FileManager } from '../file-manager/file-manager.ts';
import type { VendorEntry } from '../vendor-materializer/vendor-entry.ts';

async function writeFileDescriptions(
    fileManager: FileManager,
    targetFolder: string,
    contents: readonly FileDescription[]
): Promise<void> {
    for (const entry of contents) {
        const targetFilePath = path.join(targetFolder, entry.filePath);
        await fileManager.writeFile(targetFilePath, entry.content);
        await fileManager.setExecutable(targetFilePath, entry.isExecutable);
    }
}

async function copyVendorEntries(
    fileManager: FileManager,
    targetFolder: string,
    vendorEntries: readonly VendorEntry[]
): Promise<void> {
    for (const vendorEntry of vendorEntries) {
        const targetFilePath = path.join(targetFolder, vendorEntry.targetRelativePath);
        await fileManager.copyFileBytes(vendorEntry.sourceAbsolutePath, targetFilePath);
        await fileManager.setExecutable(targetFilePath, vendorEntry.isExecutable);
    }
}

export async function writeArtifactsToFolder(
    fileManager: FileManager,
    targetFolder: string,
    contents: readonly FileDescription[],
    vendorEntries: readonly VendorEntry[] = []
): Promise<void> {
    const readability = await fileManager.checkReadability(targetFolder);
    if (readability.isReadable) {
        throw new Error(`Folder ${targetFolder} already exists`);
    }
    await writeFileDescriptions(fileManager, targetFolder, contents);
    await copyVendorEntries(fileManager, targetFolder, vendorEntries);
}
