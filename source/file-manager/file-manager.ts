import fs from 'node:fs';
import path from 'node:path';
import type { TransferableFileDescription } from './file-description.js';
import { isExecutableFileMode } from './permissions.js';

export type FileManagerDependencies = {
    readonly hostFileSystem: typeof fs.promises;
};

type FileOrFolderReadability = {
    readonly isReadable: boolean;
};

export type FileManager = {
    checkReadability(fileOrFolderPath: string): Promise<FileOrFolderReadability>;
    readFile(filePath: string): Promise<string>;
    writeFile(filePath: string, content: string): Promise<void>;
    copyFile(from: string, to: string): Promise<void>;
    getFileMode(filePath: string): Promise<number>;
    getTransferableFileDescriptionFromPath(
        sourceFilePath: string,
        targetFilePath: string
    ): Promise<TransferableFileDescription>;
};

export function createFileManager(dependencies: FileManagerDependencies): FileManager {
    const { hostFileSystem } = dependencies;

    async function checkReadability(fileOrFolderPath: string): Promise<FileOrFolderReadability> {
        try {
            await hostFileSystem.access(fileOrFolderPath, fs.constants.R_OK);
            return { isReadable: true };
        } catch {
            return { isReadable: false };
        }
    }

    async function writeFile(filePath: string, content: string): Promise<void> {
        const containingFolder = path.dirname(filePath);
        const parentReadability = await checkReadability(containingFolder);

        if (!parentReadability.isReadable) {
            await hostFileSystem.mkdir(containingFolder, { recursive: true });
        }

        await hostFileSystem.writeFile(filePath, content, { encoding: 'utf8' });
    }

    async function readFile(filePath: string): Promise<string> {
        return hostFileSystem.readFile(filePath, { encoding: 'utf8' });
    }

    async function getFileMode(filePath: string): Promise<number> {
        const stats = await hostFileSystem.stat(filePath);
        return stats.mode;
    }

    return {
        checkReadability,

        writeFile,

        readFile,

        getFileMode,

        async getTransferableFileDescriptionFromPath(sourceFilePath, targetFilePath) {
            const mode = await getFileMode(sourceFilePath);

            return {
                sourceFilePath,
                targetFilePath,
                content: await readFile(sourceFilePath),
                isExecutable: isExecutableFileMode(mode)
            };
        },

        async copyFile(from, to) {
            const content = await readFile(from);
            await writeFile(to, content);
        }
    };
}
