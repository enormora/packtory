import os from 'node:os';
import path from 'node:path';

export function getTemporaryDirectoryPrefix(prefix: string): string {
    return path.join(os.tmpdir(), prefix);
}
