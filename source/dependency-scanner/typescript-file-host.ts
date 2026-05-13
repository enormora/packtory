import path from 'node:path';
import type { FileSystemHost } from 'ts-morph';
import { type MainPackageJson } from '../config/package-json.ts';

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
    withVirtualPackageJson: (fileSystemHost: FileSystemHost, folder: string, mainPackageJson: MainPackageJson) => FileSystemHost;
};

const syncMethodNames = {
    fileExists: 'fileExistsSync',
    directoryExists: 'directoryExistsSync',
    readFile: 'readFileSync'
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

function bindRequiredStringMethod(object: FileSystemHost, methodName: string): (path: string) => string {
    const method: unknown = Reflect.get(object, methodName);

    if (typeof method !== 'function') {
        throw new TypeError(`Expected ${methodName} to be a function`);
    }

    return (filePath) => {
        const result: unknown = Reflect.apply(method, object, [filePath]);

        if (typeof result !== 'string') {
            throw new TypeError(`Expected ${methodName} to return a string`);
        }

        return result;
    };
}

function serializeMainPackageJson(mainPackageJson: MainPackageJson): string {
    return JSON.stringify(mainPackageJson, null, 2);
}

function createVirtualPackageJsonHost(
    fileSystemHost: FileSystemHost,
    folder: string,
    mainPackageJson: MainPackageJson
): FileSystemHost {
    const packageJsonPath = path.resolve(folder, 'package.json');
    const serializedPackageJson = serializeMainPackageJson(mainPackageJson);
    const fileExistsSync = bindRequiredBooleanMethod(fileSystemHost, syncMethodNames.fileExists);
    const readFileSync = bindRequiredStringMethod(fileSystemHost, syncMethodNames.readFile);

    const virtualFileSystemHost: FileSystemHost = {
        ...fileSystemHost,
        fileExists: async (filePath: string): Promise<boolean> => {
            if (path.resolve(filePath) === packageJsonPath) {
                return true;
            }

            return fileSystemHost.fileExists(filePath);
        },
        [syncMethodNames.fileExists]: (filePath: string): boolean => {
            if (path.resolve(filePath) === packageJsonPath) {
                return true;
            }

            return fileExistsSync(filePath);
        },
        readFile: async (filePath: string, encoding?: string): Promise<string> => {
            if (path.resolve(filePath) === packageJsonPath) {
                return serializedPackageJson;
            }

            return fileSystemHost.readFile(filePath, encoding);
        },
        [syncMethodNames.readFile]: (filePath: string, _encoding?: string): string => {
            if (path.resolve(filePath) === packageJsonPath) {
                return serializedPackageJson;
            }

            return readFileSync(filePath);
        }
    };
    Object.setPrototypeOf(virtualFileSystemHost, fileSystemHost);
    return virtualFileSystemHost;
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
        fileSystemHostFilteringDeclarationFiles,
        withVirtualPackageJson(currentFileSystemHost, folder, mainPackageJson) {
            return createVirtualPackageJsonHost(currentFileSystemHost, folder, mainPackageJson);
        }
    };
}
