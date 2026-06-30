import fs from 'node:fs';
import path from 'node:path';
import type { TransferableFileDescription } from './file-description.ts';
import { isExecutableFileMode } from './permissions.ts';

export type FileManagerDependencies = {
    readonly hostFileSystem: typeof fs.promises;
};

type FileOrFolderReadability = {
    readonly isReadable: boolean;
};

type DirectoryEntry = {
    readonly name: string;
    readonly isDirectory: boolean;
    readonly isSymbolicLink: boolean;
};

export type FileManager = {
    checkReadability: (fileOrFolderPath: string) => Promise<FileOrFolderReadability>;
    readFile: (filePath: string) => Promise<string>;
    readFileBytes: (filePath: string) => Promise<Buffer>;
    writeFile: (filePath: string, content: string) => Promise<void>;
    writeBinaryFile: (filePath: string, content: Buffer) => Promise<void>;
    setExecutable: (filePath: string, executable: boolean) => Promise<void>;
    copyFile: (from: string, to: string) => Promise<void>;
    copyFileBytes: (from: string, to: string) => Promise<void>;
    listDirectoryEntries: (directoryPath: string) => Promise<readonly DirectoryEntry[]>;
    getRealPath: (filePath: string) => Promise<string>;
    getTransferableFileDescriptionFromPath: (
        sourceFilePath: string,
        targetFilePath: string
    ) => Promise<TransferableFileDescription>;
};

const executableFileMode = 0o755;
const regularFileMode = 0o644;

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

    async function ensureContainingFolder(filePath: string): Promise<void> {
        const containingFolder = path.dirname(filePath);
        const parentReadability = await checkReadability(containingFolder);

        if (!parentReadability.isReadable) {
            await hostFileSystem.mkdir(containingFolder, { recursive: true });
        }
    }

    async function writeFile(filePath: string, content: string): Promise<void> {
        await ensureContainingFolder(filePath);
        await hostFileSystem.writeFile(filePath, content, { encoding: 'utf8' });
    }

    async function writeBinaryFile(filePath: string, content: Buffer): Promise<void> {
        await ensureContainingFolder(filePath);
        await hostFileSystem.writeFile(filePath, content);
    }

    async function readFile(filePath: string): Promise<string> {
        return hostFileSystem.readFile(filePath, { encoding: 'utf8' });
    }

    async function readFileBytes(filePath: string): Promise<Buffer> {
        return hostFileSystem.readFile(filePath);
    }

    async function getFileMode(filePath: string): Promise<number> {
        const stats = await hostFileSystem.stat(filePath);
        return stats.mode;
    }

    async function setExecutable(filePath: string, executable: boolean): Promise<void> {
        const mode = executable ? executableFileMode : regularFileMode;
        await hostFileSystem.chmod(filePath, mode);
    }

    return {
        checkReadability,

        writeFile,

        writeBinaryFile,

        setExecutable,

        readFile,

        readFileBytes,

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
        },

        async copyFileBytes(from, to) {
            await ensureContainingFolder(to);
            await hostFileSystem.copyFile(from, to);
        },

        async listDirectoryEntries(directoryPath) {
            const entries = await hostFileSystem.readdir(directoryPath, { withFileTypes: true });
            return entries.map(function (entry) {
                return {
                    name: entry.name,
                    isDirectory: entry.isDirectory(),
                    isSymbolicLink: entry.isSymbolicLink()
                };
            });
        },

        async getRealPath(filePath) {
            return hostFileSystem.realpath(filePath);
        }
    };
}
