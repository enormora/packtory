import type { FileSystemHost } from 'ts-morph';
import { isBoolean } from 'remeda';
import type { MainPackageManifest } from '../configuration/package-manifest.ts';
import { isDeclarationFile, isTypesRootFolder } from './file-host-predicates.ts';
import { bindRequiredMethod, synchronousMethodNames } from './host-method-binding.ts';
import { createNodeModulesManifestSynthesizingHost } from './node-modules-manifest-synthesizer.ts';
import { createVirtualPackageManifestHost } from './virtual-package-manifest-host.ts';

export type FileSystemAdaptersDependencies = {
    readonly fileSystemHost: FileSystemHost;
};

export type FileSystemAdapters = {
    readonly fileSystemHostWithoutFilter: FileSystemHost;
    readonly fileSystemHostFilteringDeclarationFiles: FileSystemHost;
    readonly withVirtualPackageManifest: (
        fileSystemHost: FileSystemHost,
        folder: string,
        mainPackageManifest: MainPackageManifest
    ) => FileSystemHost;
};

function createDeclarationFilteringHost(fileSystemHost: FileSystemHost): FileSystemHost {
    const fileExistsSync = bindRequiredMethod(
        fileSystemHost,
        synchronousMethodNames.fileExists,
        'a boolean',
        isBoolean
    );
    const directoryExistsSync = bindRequiredMethod(
        fileSystemHost,
        synchronousMethodNames.directoryExists,
        'a boolean',
        isBoolean
    );

    const filteringHost: FileSystemHost = {
        ...fileSystemHost,
        async fileExists(filePath: string): Promise<boolean> {
            if (isDeclarationFile(filePath)) {
                return false;
            }

            return fileSystemHost.fileExists(filePath);
        },
        [synchronousMethodNames.fileExists](filePath: string): boolean {
            if (isDeclarationFile(filePath)) {
                return false;
            }

            // eslint-disable-next-line node/no-sync -- the ts-morph host interface requires this synchronous method
            return fileExistsSync(filePath);
        },
        async directoryExists(directoryPath: string): Promise<boolean> {
            if (isTypesRootFolder(directoryPath)) {
                return false;
            }

            return fileSystemHost.directoryExists(directoryPath);
        },
        [synchronousMethodNames.directoryExists](directoryPath: string): boolean {
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
        withVirtualPackageManifest: createVirtualPackageManifestHost
    };
}
