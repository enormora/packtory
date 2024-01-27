import { areFileDescriptionEqual } from './equal.js';
import type { FileDescription } from './file-description.js';
import { sortByFilePath } from './sort.js';

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
    const areAllFileDescriptionsEqual = sortedFileDescriptionsA.every((fileDescriptionA, index) => {
        const fileDescriptionB = sortedFileDescriptionsB[index];
        return fileDescriptionB !== undefined && areFileDescriptionEqual(fileDescriptionA, fileDescriptionB);
    });

    if (areAllFileDescriptionsEqual) {
        return { status: 'equal' };
    }

    return { status: 'not-equal' };
}
