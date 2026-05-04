import { areFileDescriptionEqual } from './equal.ts';
import type { FileDescription } from './file-description.ts';
import { sortByFilePath } from './sort.ts';

type FileDescriptionsComparisonResult = {
    status: 'equal' | 'not-equal';
};

export function compareFileDescriptions(
    fileDescriptionsA: readonly FileDescription[],
    fileDescriptionsB: readonly FileDescription[]
): FileDescriptionsComparisonResult {
    if (fileDescriptionsA.length !== fileDescriptionsB.length) {
        return { status: 'not-equal' };
    }

    const sortedFileDescriptionsA = sortByFilePath(fileDescriptionsA);
    const sortedFileDescriptionsB = sortByFilePath(fileDescriptionsB);

    for (const [index, fileDescriptionA] of sortedFileDescriptionsA.entries()) {
        const fileDescriptionB = sortedFileDescriptionsB[index];

        if (fileDescriptionB === undefined || !areFileDescriptionEqual(fileDescriptionA, fileDescriptionB)) {
            return { status: 'not-equal' };
        }
    }

    return { status: 'equal' };
}
