import path from 'node:path';
import type { FileDescription } from '../file-manager/file-description.ts';
import type { FileManager } from '../file-manager/file-manager.ts';

export async function writeArtifactsToFolder(
    fileManager: FileManager,
    targetFolder: string,
    contents: readonly FileDescription[]
): Promise<void> {
    const readability = await fileManager.checkReadability(targetFolder);
    if (readability.isReadable) {
        throw new Error(`Folder ${targetFolder} already exists`);
    }

    for (const entry of contents) {
        const targetFilePath = path.join(targetFolder, entry.filePath);
        await fileManager.writeFile(targetFilePath, entry.content);
        await fileManager.setExecutable(targetFilePath, entry.isExecutable);
    }
}
