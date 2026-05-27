import { ancestorInstalledDependencyPathCandidates } from '../common/package-layout.ts';

export function findPackageOwnedAssetFilePath(
    importValue: string,
    currentFolder: string,
    fileExists: (filePath: string) => boolean
): string | undefined {
    for (const candidatePath of ancestorInstalledDependencyPathCandidates(currentFolder, importValue)) {
        if (fileExists(candidatePath)) {
            return candidatePath;
        }
    }

    return undefined;
}
