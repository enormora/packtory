import path from 'node:path';
import type { FileSystemHost } from 'ts-morph';
import { isBoolean, isString } from 'remeda';
import { packageManifestAbsolutePathIn } from '../common/package-layout.ts';
import type { MainPackageManifest } from '../configuration/package-manifest.ts';
import { bindRequiredMethod, synchronousMethodNames } from './host-method-binding.ts';

const packageManifestIndentationSpaces = 2;

function serializeMainPackageManifest(mainPackageManifest: MainPackageManifest): string {
    return JSON.stringify(mainPackageManifest, null, packageManifestIndentationSpaces);
}

export function createVirtualPackageManifestHost(
    fileSystemHost: FileSystemHost,
    folder: string,
    mainPackageManifest: MainPackageManifest
): FileSystemHost {
    const packageManifestPath = packageManifestAbsolutePathIn(folder);
    const serializedPackageManifest = serializeMainPackageManifest(mainPackageManifest);
    const fileExistsSync = bindRequiredMethod(
        fileSystemHost,
        synchronousMethodNames.fileExists,
        'a boolean',
        isBoolean
    );
    const readFileSync = bindRequiredMethod(fileSystemHost, synchronousMethodNames.readFile, 'a string', isString);

    const virtualFileSystemHost: FileSystemHost = {
        ...fileSystemHost,
        async fileExists(filePath: string): Promise<boolean> {
            if (path.resolve(filePath) === packageManifestPath) {
                return true;
            }

            return fileSystemHost.fileExists(filePath);
        },
        [synchronousMethodNames.fileExists](filePath: string): boolean {
            if (path.resolve(filePath) === packageManifestPath) {
                return true;
            }

            // eslint-disable-next-line node/no-sync -- the ts-morph host interface requires this synchronous method
            return fileExistsSync(filePath);
        },
        async readFile(filePath: string, encoding?: string): Promise<string> {
            if (path.resolve(filePath) === packageManifestPath) {
                return serializedPackageManifest;
            }

            return fileSystemHost.readFile(filePath, encoding);
        },
        [synchronousMethodNames.readFile](filePath: string): string {
            if (path.resolve(filePath) === packageManifestPath) {
                return serializedPackageManifest;
            }

            // eslint-disable-next-line node/no-sync -- the ts-morph host interface requires this synchronous method
            return readFileSync(filePath);
        }
    };
    Object.setPrototypeOf(virtualFileSystemHost, fileSystemHost);
    return virtualFileSystemHost;
}
