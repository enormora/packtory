import type { FileSystemHost } from 'ts-morph';
import { isBoolean } from 'remeda';
import type { MainPackageJson } from '../config/package-json.ts';
import { isDeclarationFile, isTypesRootFolder } from './file-host-predicates.ts';
import { bindRequiredMethod, syncMethodNames } from './host-method-binding.ts';
import { createNodeModulesManifestSynthesizingHost } from './node-modules-manifest-synthesizer.ts';
import { createVirtualPackageJsonHost } from './virtual-package-json-host.ts';

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

function createDeclarationFilteringHost(fileSystemHost: FileSystemHost): FileSystemHost {
    const fileExistsSync = bindRequiredMethod(fileSystemHost, syncMethodNames.fileExists, 'a boolean', isBoolean);
    const directoryExistsSync = bindRequiredMethod(
        fileSystemHost,
        syncMethodNames.directoryExists,
        'a boolean',
        isBoolean
    );

    const filteringHost: FileSystemHost = {
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
    Object.setPrototypeOf(filteringHost, fileSystemHost);
    return filteringHost;
}

export function createFileSystemAdapters(dependencies: FileSystemAdaptersDependencies): FileSystemAdapters {
    const { fileSystemHost } = dependencies;
    const synthesizingHost = createNodeModulesManifestSynthesizingHost(fileSystemHost);
    return {
        fileSystemHostWithoutFilter: synthesizingHost,
        fileSystemHostFilteringDeclarationFiles: createDeclarationFilteringHost(synthesizingHost),
        withVirtualPackageJson: createVirtualPackageJsonHost
    };
}
