import path from 'node:path';
import { InMemoryFileSystemHost } from 'ts-morph';
import type { FileManager } from '../file-manager/file-manager.ts';
import { type CompilerWorkspace, createCompilerWorkspace } from './compiler-workspace.ts';

import { createFakeFileManager } from './fake-file-manager.ts';

export type InMemoryCompilerWorkspace = CompilerWorkspace & {
    readonly fileSystemHost: InMemoryFileSystemHost;
};

function createWorkspaceFileManager(host: InMemoryFileSystemHost): FileManager {
    return {
        ...createFakeFileManager(),
        async checkReadability(filePath) {
            return { isReadable: await host.fileExists(filePath) || await host.directoryExists(filePath) };
        },
        async checkDirectory(filePath) {
            const directory = await host.directoryExists(filePath);
            return directory || await host.fileExists(filePath)
                ? { exists: true, isDirectory: directory }
                : { exists: false };
        },
        async readFile(filePath) {
            return host.readFile(filePath);
        },
        async writeFile(filePath, content) {
            await host.mkdir(path.dirname(filePath));
            await host.writeFile(filePath, content);
        },
        async getRealPath(filePath) {
            return filePath;
        },
        async listDirectoryEntries(folder) {
            // eslint-disable-next-line node/no-sync -- This ts-morph host reads only in-memory entries.
            return host.readDirSync(folder).map(function (entry) {
                return {
                    name: path.basename(entry.name),
                    isDirectory: entry.isDirectory,
                    isSymbolicLink: entry.isSymlink
                };
            });
        }
    };
}

export async function withInMemoryCompilerWorkspace(
    run: (workspace: InMemoryCompilerWorkspace) => Promise<void>
): Promise<void> {
    const folder = '/workspace';
    const fileSystemHost = new InMemoryFileSystemHost();
    await fileSystemHost.mkdir(folder);
    const fileManager = createWorkspaceFileManager(fileSystemHost);
    const workspace = createCompilerWorkspace({
        folder,
        fileSystemHost,
        fileManager,
        async remove() {
            return undefined;
        }
    });
    await run({ ...workspace, fileSystemHost });
}
