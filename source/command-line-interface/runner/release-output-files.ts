import path from 'node:path';
import { collectChangelogOutputFilePaths, type ChangelogConfig } from './changelog-destinations.ts';

type ReleaseOutputFilesInput = {
    readonly config: ChangelogConfig;
    readonly workingDirectory: string;
};

function normalizeRepositoryPath(filePath: string): string {
    return filePath.split(path.sep).join('/');
}

function toRepositoryRelativePath(workingDirectory: string, filePath: string): string {
    return normalizeRepositoryPath(path.relative(workingDirectory, filePath));
}

export function collectReleaseOutputFiles(input: ReleaseOutputFilesInput): readonly string[] {
    return collectChangelogOutputFilePaths({ workingDirectory: input.workingDirectory }, input.config).map(
        function (output) {
            return toRepositoryRelativePath(input.workingDirectory, output.filePath);
        }
    );
}
