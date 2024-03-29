import fs from 'node:fs';
import path from 'node:path';

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

    return {
        checkReadability,

        writeFile,

        readFile,

        async copyFile(from, to) {
            const content = await readFile(from);
            await writeFile(to, content);
        },

        async getFileMode(filePath) {
            const stats = await hostFileSystem.stat(filePath);
            return stats.mode;
        }
    };
}
