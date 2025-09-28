import type { FileSystemHost } from 'ts-morph';

const declarationFileExtensions = new Set(['.d.ts', '.d.cts', '.d.mts']);

function isDeclarationFile(filePath: string): boolean {
    const lowerCasedFilePath = filePath.toLowerCase();

    for (const declarationFileExtension of declarationFileExtensions) {
        if (lowerCasedFilePath.endsWith(declarationFileExtension)) {
            return true;
        }
    }

    return false;
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

export function createFileSystemAdapters(dependencies: FileSystemAdaptersDependencies): FileSystemAdapters {
    const { fileSystemHost } = dependencies;

    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- ok in this case
    const fileSystemHostFilteringDeclarationFiles = Object.create(fileSystemHost) as unknown as FileSystemHost;

    fileSystemHostFilteringDeclarationFiles.fileExists = async (filePath) => {
        if (isDeclarationFile(filePath)) {
            return false;
        }

        return fileSystemHost.fileExists(filePath);
    };
    fileSystemHostFilteringDeclarationFiles.fileExistsSync = (filePath) => {
        if (isDeclarationFile(filePath)) {
            return false;
        }

        // eslint-disable-next-line node/no-sync -- we need to provide this method to match the expected interface
        return fileSystemHost.fileExistsSync(filePath);
    };

    fileSystemHostFilteringDeclarationFiles.directoryExists = async (directoryPath) => {
        if (isTypesRootFolder(directoryPath)) {
            return false;
        }

        return fileSystemHost.directoryExists(directoryPath);
    };

    fileSystemHostFilteringDeclarationFiles.directoryExistsSync = (directoryPath) => {
        if (isTypesRootFolder(directoryPath)) {
            return false;
        }

        // eslint-disable-next-line node/no-sync -- we need to provide this method to match the expected interface
        return fileSystemHost.directoryExistsSync(directoryPath);
    };

    return {
        fileSystemHostWithoutFilter: fileSystemHost,
        fileSystemHostFilteringDeclarationFiles
    };
}
