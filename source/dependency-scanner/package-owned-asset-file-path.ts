import path from 'node:path';

function packageOwnedAssetSearchFolders(currentFolder: string): readonly string[] {
    const resolvedFolder = path.resolve(currentFolder);
    const rootFolder = path.parse(resolvedFolder).root;
    const relativePath = path.relative(rootFolder, resolvedFolder);
    const relativeSegments = relativePath.split(path.sep);
    const maximumSegmentCount = relativePath.length === 0 ? 0 : relativeSegments.length;
    return Array.from({ length: maximumSegmentCount + 1 }, (_unused, index) => {
        return path.join(rootFolder, ...relativeSegments.slice(0, maximumSegmentCount - index));
    });
}

export function findPackageOwnedAssetFilePath(
    importValue: string,
    currentFolder: string,
    fileExists: (filePath: string) => boolean
): string | undefined {
    for (const searchFolder of packageOwnedAssetSearchFolders(currentFolder)) {
        const candidatePath = path.join(searchFolder, 'node_modules', importValue);
        if (fileExists(candidatePath)) {
            return candidatePath;
        }
    }

    return undefined;
}
