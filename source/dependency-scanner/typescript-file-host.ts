import path from 'node:path';
import type { FileSystemHost } from 'ts-morph';
import type { MainPackageJson } from '../config/package-json.ts';

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
    withVirtualPackageJson: (
        fileSystemHost: FileSystemHost,
        folder: string,
        mainPackageJson: MainPackageJson
    ) => FileSystemHost;
};

const syncMethodNames = {
    fileExists: 'fileExistsSync',
    directoryExists: 'directoryExistsSync',
    readFile: 'readFileSync'
} as const;

function bindRequiredMethod<Result>(
    object: FileSystemHost,
    methodName: string,
    expectedResultDescription: string,
    validateResult: (value: unknown) => value is Result
): (filePath: string) => Result {
    const method: unknown = Reflect.get(object, methodName);

    if (typeof method !== 'function') {
        throw new TypeError(`Expected ${methodName} to be a function`);
    }

    return (filePath) => {
        const result: unknown = Reflect.apply(method, object, [filePath]);

        if (!validateResult(result)) {
            throw new TypeError(`Expected ${methodName} to return ${expectedResultDescription}`);
        }

        return result;
    };
}

function isBoolean(value: unknown): value is boolean {
    return typeof value === 'boolean';
}

function isString(value: unknown): value is string {
    return typeof value === 'string';
}

const packageJsonIndentationSpaces = 2;

function serializeMainPackageJson(mainPackageJson: MainPackageJson): string {
    return JSON.stringify(mainPackageJson, null, packageJsonIndentationSpaces);
}

function createVirtualPackageJsonHost(
    fileSystemHost: FileSystemHost,
    folder: string,
    mainPackageJson: MainPackageJson
): FileSystemHost {
    const packageJsonPath = path.resolve(folder, 'package.json');
    const serializedPackageJson = serializeMainPackageJson(mainPackageJson);
    const fileExistsSync = bindRequiredMethod(fileSystemHost, syncMethodNames.fileExists, 'a boolean', isBoolean);
    const readFileSync = bindRequiredMethod(fileSystemHost, syncMethodNames.readFile, 'a string', isString);

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

            // eslint-disable-next-line node/no-sync -- the ts-morph host interface requires this synchronous method
            return fileExistsSync(filePath);
        },
        readFile: async (filePath: string, encoding?: string): Promise<string> => {
            if (path.resolve(filePath) === packageJsonPath) {
                return serializedPackageJson;
            }

            return fileSystemHost.readFile(filePath, encoding);
        },
        // eslint-disable-next-line @typescript-eslint/no-unused-vars -- the ts-morph host signature includes encoding
        [syncMethodNames.readFile]: (filePath: string, encoding?: string): string => {
            if (path.resolve(filePath) === packageJsonPath) {
                return serializedPackageJson;
            }

            // eslint-disable-next-line node/no-sync -- the ts-morph host interface requires this synchronous method
            return readFileSync(filePath);
        }
    };
    Object.setPrototypeOf(virtualFileSystemHost, fileSystemHost);
    return virtualFileSystemHost;
}

export function createFileSystemAdapters(dependencies: FileSystemAdaptersDependencies): FileSystemAdapters {
    const { fileSystemHost } = dependencies;

    const fileExistsSync = bindRequiredMethod(fileSystemHost, syncMethodNames.fileExists, 'a boolean', isBoolean);
    const directoryExistsSync = bindRequiredMethod(
        fileSystemHost,
        syncMethodNames.directoryExists,
        'a boolean',
        isBoolean
    );

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
        withVirtualPackageJson: createVirtualPackageJsonHost
    };
}
