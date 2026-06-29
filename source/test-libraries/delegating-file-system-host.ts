import type { FileSystemHost } from 'ts-morph';

export function createDelegatingFileSystemHost(records: ReadonlyMap<string, string>): FileSystemHost {
    return {
        async fileExists(filePath: string) {
            return records.has(filePath);
        },
        fileExistsSync(filePath: string) {
            return records.has(filePath);
        },
        async readFile(filePath: string) {
            return records.get(filePath) ?? '';
        },
        readFileSync(filePath: string) {
            return records.get(filePath) ?? '';
        }
    } as unknown as FileSystemHost;
}
