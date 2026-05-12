import path from 'node:path';
import type { Project } from 'ts-morph';
import { isCodeFile } from '../common/code-files.ts';
import type { AdditionalFileDescription } from '../config/additional-files.ts';
import type { LocalFile } from '../dependency-scanner/dependency-graph.ts';

function prependSourcesFolderIfNecessary(sourcesFolder: string, filePath: string): string {
    if (!path.isAbsolute(filePath)) {
        return path.join(sourcesFolder, filePath);
    }

    return filePath;
}

function rejectCodeFile(targetFilePath: string): void {
    if (isCodeFile(targetFilePath)) {
        throw new Error(
            [
                `additionalFiles must not include code files; received "${targetFilePath}".`,
                'Code that should ship in the bundle must be reachable from an entry point so',
                'dependency, side-effect and dead-code analyses can run on it.',
                'If you intend to ship code as a static asset (e.g. a template),',
                'use a non-code extension like .txt.'
            ].join(' ')
        );
    }
}

type ResolvedBundleFile = {
    readonly sourceFilePath: string;
    readonly targetFilePath: string;
    readonly directDependencies: ReadonlySet<string>;
    readonly project?: Project | undefined;
    readonly isExplicitlyIncluded: boolean;
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
            project: localFile.project,
            isExplicitlyIncluded: false
        };
    });

    const additionalContents = additionalFiles.map((additionalFile): ResolvedBundleFile => {
        if (typeof additionalFile === 'string') {
            rejectCodeFile(additionalFile);
            const sourceFilePath = path.join(sourcesFolder, additionalFile);
            const targetFilePath = additionalFile;
            return {
                sourceFilePath,
                targetFilePath,
                directDependencies: new Set(),
                isExplicitlyIncluded: true
            };
        }

        if (path.isAbsolute(additionalFile.targetFilePath)) {
            throw new Error('The targetFilePath must be relative');
        }
        rejectCodeFile(additionalFile.targetFilePath);

        return {
            sourceFilePath: prependSourcesFolderIfNecessary(sourcesFolder, additionalFile.sourceFilePath),
            targetFilePath: additionalFile.targetFilePath,
            directDependencies: new Set(),
            isExplicitlyIncluded: true
        };
    });

    return [...resolvedLocalFiles, ...additionalContents];
}
