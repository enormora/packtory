import path from 'node:path';
import type { Project } from 'ts-morph';
import type { AdditionalFileDescription } from '../config/additional-files.ts';
import type { LocalFile } from '../dependency-scanner/dependency-graph.ts';

function prependSourcesFolderIfNecessary(sourcesFolder: string, filePath: string): string {
    if (!path.isAbsolute(filePath)) {
        return path.join(sourcesFolder, filePath);
    }

    return filePath;
}

type ResolvedBundleFile = {
    readonly sourceFilePath: string;
    readonly targetFilePath: string;
    readonly directDependencies: ReadonlySet<string>;
    readonly project?: Project | undefined;
};

export function combineAllBundleFiles(
    sourcesFolder: string,
    localDependencies: readonly LocalFile[],
    additionalFiles: readonly (AdditionalFileDescription | string)[]
): readonly ResolvedBundleFile[] {
    const resolvedLocalFiles = localDependencies.map((localFile) => {
        const targetFilePath = path.relative(sourcesFolder, localFile.filePath);
        return {
            sourceFilePath: localFile.filePath,
            targetFilePath,
            directDependencies: localFile.directDependencies,
            project: localFile.project
        };
    });

    const additionalContents = additionalFiles.map((additionalFile): ResolvedBundleFile => {
        if (typeof additionalFile === 'string') {
            const sourceFilePath = path.join(sourcesFolder, additionalFile);
            const targetFilePath = additionalFile;
            return { sourceFilePath, targetFilePath, directDependencies: new Set() };
        }

        if (path.isAbsolute(additionalFile.targetFilePath)) {
            throw new Error('The targetFilePath must be relative');
        }

        return {
            sourceFilePath: prependSourcesFolderIfNecessary(sourcesFolder, additionalFile.sourceFilePath),
            targetFilePath: additionalFile.targetFilePath,
            directDependencies: new Set()
        };
    });

    return [...resolvedLocalFiles, ...additionalContents];
}
