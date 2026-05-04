import type { FileSystemHost } from 'ts-morph';

function isDeclarationFile(filePath: string): boolean {
    const lowerCasedFilePath = filePath.toLowerCase();
    return (
        lowerCasedFilePath.endsWith('.d.ts') ||
        lowerCasedFilePath.endsWith('.d.cts') ||
        lowerCasedFilePath.endsWith('.d.mts')
    );
}

function isTypesRootFolder(directoryPath: string): boolean {
    return directoryPath.endsWith('/node_modules/@types') || directoryPath.includes('/node_modules/@types/');
}

export type FileSystemAdaptersDependencies = {
    fileSystemHost: FileSystemHost;
};

export type FileSystemAdapters = {
    fileSystemHostWithoutFilter: FileSystemHost;
    fileSystemHostFilteringDeclarationFiles: FileSystemHost;
};

const syncMethodNames = {
    fileExists: 'fileExistsSync',
    directoryExists: 'directoryExistsSync'
} as const;

function bindRequiredBooleanMethod(object: FileSystemHost, methodName: string): (path: string) => boolean {
    const method: unknown = Reflect.get(object, methodName);

    if (typeof method !== 'function') {
        throw new TypeError(`Expected ${methodName} to be a function`);
    }

    return (path) => {
        const result: unknown = Reflect.apply(method, object, [path]);

        if (typeof result !== 'boolean') {
            throw new TypeError(`Expected ${methodName} to return a boolean`);
        }

        return result;
    };
}

export function createFileSystemAdapters(dependencies: FileSystemAdaptersDependencies): FileSystemAdapters {
    const { fileSystemHost } = dependencies;

    const fileExistsSync = bindRequiredBooleanMethod(fileSystemHost, syncMethodNames.fileExists);
    const directoryExistsSync = bindRequiredBooleanMethod(fileSystemHost, syncMethodNames.directoryExists);

    const fileSystemHostFilteringDeclarationFiles: FileSystemHost = {
        ...fileSystemHost,
        fileExists: async (filePath: string): Promise<boolean> => {
            if (isDeclarationFile(filePath)) {
                return false;
            }

            return fileSystemHost.fileExists(filePath);
        },
        [syncMethodNames.fileExists]: (filePath: string): boolean => {
            if (isDeclarationFile(filePath)) {
                return false;
            }

            // eslint-disable-next-line node/no-sync -- the ts-morph host interface requires this synchronous method
            return fileExistsSync(filePath);
        },
        directoryExists: async (directoryPath: string): Promise<boolean> => {
            if (isTypesRootFolder(directoryPath)) {
                return false;
            }

            return fileSystemHost.directoryExists(directoryPath);
        },
        [syncMethodNames.directoryExists]: (directoryPath: string): boolean => {
            if (isTypesRootFolder(directoryPath)) {
                return false;
            }

            // eslint-disable-next-line node/no-sync -- the ts-morph host interface requires this synchronous method
            return directoryExistsSync(directoryPath);
        }
    };
    Object.setPrototypeOf(fileSystemHostFilteringDeclarationFiles, fileSystemHost);

    return {
        fileSystemHostWithoutFilter: fileSystemHost,
        fileSystemHostFilteringDeclarationFiles
    };
}
