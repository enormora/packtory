import fs from 'node:fs';
import path from 'node:path';
import _copyFiles from 'cpy';
import { PackageJson } from 'type-fest';

export interface CopyOptions {
    readonly additionalFiles: readonly string[];
    readonly targetFolder: string;
    readonly srcFolder: string;
    readonly prefixFolder: string;
}

export interface FileManagerDependencies {
    readonly copyFiles: typeof _copyFiles;
    readonly rm: typeof fs.promises.rm;
    readonly mkdir: typeof fs.promises.mkdir;
    readonly writeFile: typeof fs.promises.writeFile;
}

export interface FileManager {
    copyFilesToTarget(files: readonly string[], options: CopyOptions): Promise<readonly string[]>;
    createCleanFolder(folderPath: string): Promise<void>;
    writePackageJson(packageJsonFolderPath: string, packageJsonData: PackageJson): Promise<void>;
}

function mapFilesToRelativePaths(files: readonly string[], fromPath: string): readonly string[] {
    return files.map((file: string): string => {
        return path.relative(fromPath, file);
    });
}

export function createFileManager(dependencies: FileManagerDependencies): FileManager {
    const { copyFiles, rm, mkdir, writeFile } = dependencies;

    return {
        async writePackageJson(packageJsonFolderPath, packageJsonData) {
            const serializedData = JSON.stringify(packageJsonData, null, 4);
            const packageJsonPath = path.join(packageJsonFolderPath, 'package.json');

            await writeFile(packageJsonPath, serializedData);
        },

        async createCleanFolder(folderPath) {
            await rm(folderPath, { force: true, recursive: true });
            await mkdir(folderPath, { recursive: true });
        },

        async copyFilesToTarget(files, options): Promise<string[]> {
            const { srcFolder, targetFolder, prefixFolder, additionalFiles } = options;
            const relativeFilePaths = mapFilesToRelativePaths(files, srcFolder);
            const targetFolderWithPrefix = path.join(targetFolder, prefixFolder);

            await copyFiles(relativeFilePaths, targetFolderWithPrefix, { cwd: srcFolder, parents: true });

            await Promise.all(
                additionalFiles.map(async (file) => {
                    await copyFiles(file, targetFolderWithPrefix, {
                        cwd: srcFolder,
                        parents: true
                    });
                })
            );

            const prefixedRelativePackagePaths = [...additionalFiles, ...relativeFilePaths].map((file) =>
                path.join(prefixFolder, file)
            );

            return prefixedRelativePackagePaths;
        }
    };
}
