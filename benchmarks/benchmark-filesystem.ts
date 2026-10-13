import fileSystem from 'node:fs/promises';
import { getTemporaryDirectoryPrefix } from './benchmark-paths.ts';

export async function createTemporaryDirectory(prefix: string): Promise<string> {
    return fileSystem.mkdtemp(getTemporaryDirectoryPrefix(prefix));
}

export async function removeDirectory(directoryPath: string): Promise<void> {
    await fileSystem.rm(directoryPath, { recursive: true, force: true });
}
