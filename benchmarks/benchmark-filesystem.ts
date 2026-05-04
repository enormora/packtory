import fs from 'node:fs/promises';
import { getTemporaryDirectoryPrefix } from './benchmark-paths.ts';

export async function createTemporaryDirectory(prefix: string): Promise<string> {
    return fs.mkdtemp(getTemporaryDirectoryPrefix(prefix));
}

export async function removeDirectory(directoryPath: string): Promise<void> {
    await fs.rm(directoryPath, { recursive: true, force: true });
}
