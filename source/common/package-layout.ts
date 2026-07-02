import path from 'node:path';

export const packageManifestFilePath = 'package.json';
export const sbomArtifactFilePath = 'sbom.cdx.json';
export const installedDependenciesFolderName = 'node_modules';

const tarballPackageRootPrefix = 'package/';

export function bundleRelativePath(filePath: string): string {
    return filePath.startsWith(tarballPackageRootPrefix) ? filePath.slice(tarballPackageRootPrefix.length) : filePath;
}

function currentAndAncestorFolders(startFolder: string): readonly string[] {
    const folders: string[] = [];

    function collect(folder: string): void {
        folders.push(folder);
        const parentFolder = path.dirname(folder);
        if (parentFolder !== folder) {
            collect(parentFolder);
        }
    }

    collect(path.resolve(startFolder));

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
    const candidates: string[] = Array.from(
        currentAndAncestorFolders(currentFolder),
        function (folder) {
            return path.join(folder, installedDependenciesFolderName, relativeTargetPath);
        }
    );

    return candidates;
}
