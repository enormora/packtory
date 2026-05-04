import type { FileDescription } from './file-description.ts';

export function sortByFilePath(fileDescriptions: readonly FileDescription[]): readonly FileDescription[] {
    return Array.from(fileDescriptions).toSorted((first, second) => {
        if (first.filePath < second.filePath) {
            return -1;
        }

        if (first.filePath > second.filePath) {
            return 1;
        }

        return 0;
    });
}
