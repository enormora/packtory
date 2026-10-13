import path from 'node:path';
import { collectChangelogOutputFilePaths, type ChangelogConfiguration } from './changelog-destinations.ts';

type ReleaseOutputFilesInput = {
    readonly configuration: ChangelogConfiguration;
    readonly workingDirectory: string;
};

function normalizeRepositoryPath(filePath: string): string {
    return filePath.split(path.sep).join('/');
}

function toRepositoryRelativePath(workingDirectory: string, filePath: string): string {
    return normalizeRepositoryPath(path.relative(workingDirectory, filePath));
}

export function collectReleaseOutputFiles(input: ReleaseOutputFilesInput): readonly string[] {
    return collectChangelogOutputFilePaths({ workingDirectory: input.workingDirectory }, input.configuration).map(
        function (output) {
            return toRepositoryRelativePath(input.workingDirectory, output.filePath);
        }
    );
}

function releaseCommitFilePath(workingDirectory: string, filePath: string): string {
    const normalizedWorkingDirectory = workingDirectory.replaceAll('\\', '/');
    const normalizedFilePath = filePath.replaceAll('\\', '/');
    const prefix = normalizedWorkingDirectory.endsWith('/')
        ? normalizedWorkingDirectory
        : `${normalizedWorkingDirectory}/`;
    if (normalizedFilePath.startsWith(prefix)) {
        return normalizedFilePath.slice(prefix.length);
    }
    return normalizedFilePath;
}

export type PreparedReleaseFile = {
    readonly contentBase64: string;
    readonly path: string;
};

type WrittenReleaseChangelogFile = {
    readonly content: string;
    readonly filePath: string;
};

export function toPreparedReleaseFile(
    workingDirectory: string,
    file: WrittenReleaseChangelogFile
): PreparedReleaseFile {
    return {
        contentBase64: Buffer.from(file.content).toString('base64'),
        path: releaseCommitFilePath(workingDirectory, file.filePath)
    };
}
