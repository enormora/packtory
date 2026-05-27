import type { FileDescription } from './file-description.ts';

export function fileDescriptionByPath(files: readonly FileDescription[]): ReadonlyMap<string, FileDescription> {
    const filesByPath = new Map<string, FileDescription>();

    for (const file of files) {
        filesByPath.set(file.filePath, file);
    }

    return filesByPath;
}
