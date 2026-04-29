import type { FileDescription } from './file-description.ts';

export function sortByFilePath(fileDescriptions: readonly FileDescription[]): readonly FileDescription[] {
    return Array.from(fileDescriptions).toSorted((first, second) => {
        return first.filePath.localeCompare(second.filePath);
    });
}
