import path from 'node:path';

export const packageManifestFilePath = 'package.json';
export const installedDependenciesFolderName = 'node_modules';

function currentAndAncestorFolders(startFolder: string): readonly string[] {
    const folders: string[] = [];
    let currentFolder = path.resolve(startFolder);
    const ancestorSteps = Array.from({ length: currentFolder.split(path.sep).length + 1 });

    ancestorSteps.some(() => {
        folders.push(currentFolder);
        const parentFolder = path.dirname(currentFolder);
        if (parentFolder === currentFolder) {
            return true;
        }

        currentFolder = parentFolder;
        return false;
    });

    return folders;
}

export function packageManifestPathIn(folder: string): string {
    return path.join(folder, packageManifestFilePath);
}

export function packageManifestAbsolutePathIn(folder: string): string {
    return path.resolve(folder, packageManifestFilePath);
}

function installedDependencyPathIn(folder: string, dependencyName: string): string {
    return path.join(folder, installedDependenciesFolderName, dependencyName);
}

export function installedDependencyManifestPathIn(folder: string, dependencyName: string): string {
    return packageManifestPathIn(installedDependencyPathIn(folder, dependencyName));
}

export function bundledInstalledDependencyPath(packageName: string, relativePath: string): string {
    const normalizedRelativePath = relativePath.split(path.sep).join(path.posix.sep);
    return path.posix.join(installedDependenciesFolderName, packageName, normalizedRelativePath);
}

export function isPackageManifestPath(filePath: string): boolean {
    return path.basename(filePath) === packageManifestFilePath;
}

export function isInstalledDependencyManifestPath(filePath: string): boolean {
    return (
        isPackageManifestPath(filePath) &&
        path.normalize(filePath).split(path.sep).includes(installedDependenciesFolderName)
    );
}

export function ancestorInstalledDependencyPathCandidates(
    currentFolder: string,
    relativeTargetPath: string
): readonly string[] {
    const candidates: string[] = [];

    for (const folder of currentAndAncestorFolders(currentFolder)) {
        candidates.push(path.join(folder, installedDependenciesFolderName, relativeTargetPath));
    }

    return candidates;
}
