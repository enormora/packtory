import type { FileSystemHost } from 'ts-morph';

export function createDelegatingFileSystemHost(records: Map<string, string>): FileSystemHost {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- the host interface from ts-morph has many methods; tests only need the read/exists subset
    return {
        fileExists: async (filePath: string) => records.has(filePath),
        fileExistsSync: (filePath: string) => records.has(filePath),
        readFile: async (filePath: string) => records.get(filePath) ?? '',
        readFileSync: (filePath: string) => records.get(filePath) ?? ''
    } as unknown as FileSystemHost;
}
