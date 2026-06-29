import path from 'node:path';
import type { FileSystemHost } from 'ts-morph';
import { isBoolean, isString } from 'remeda';
import { packageManifestAbsolutePathIn } from '../common/package-layout.ts';
import type { MainPackageJson } from '../config/package-json.ts';
import { bindRequiredMethod, syncMethodNames } from './host-method-binding.ts';

const packageJsonIndentationSpaces = 2;

function serializeMainPackageJson(mainPackageJson: MainPackageJson): string {
    return JSON.stringify(mainPackageJson, null, packageJsonIndentationSpaces);
}

export function createVirtualPackageJsonHost(
    fileSystemHost: FileSystemHost,
    folder: string,
    mainPackageJson: MainPackageJson
): FileSystemHost {
    const packageJsonPath = packageManifestAbsolutePathIn(folder);
    const serializedPackageJson = serializeMainPackageJson(mainPackageJson);
    const fileExistsSync = bindRequiredMethod(fileSystemHost, syncMethodNames.fileExists, 'a boolean', isBoolean);
    const readFileSync = bindRequiredMethod(fileSystemHost, syncMethodNames.readFile, 'a string', isString);

    const virtualFileSystemHost: FileSystemHost = {
        ...fileSystemHost,
        async fileExists(filePath: string): Promise<boolean> {
            if (path.resolve(filePath) === packageJsonPath) {
                return true;
            }

            return fileSystemHost.fileExists(filePath);
        },
        [syncMethodNames.fileExists](filePath: string): boolean {
            if (path.resolve(filePath) === packageJsonPath) {
                return true;
            }

            // eslint-disable-next-line node/no-sync -- the ts-morph host interface requires this synchronous method
            return fileExistsSync(filePath);
        },
        async readFile(filePath: string, encoding?: string): Promise<string> {
            if (path.resolve(filePath) === packageJsonPath) {
                return serializedPackageJson;
            }

            return fileSystemHost.readFile(filePath, encoding);
        },
        [syncMethodNames.readFile](filePath: string): string {
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
