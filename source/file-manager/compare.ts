import { sortBy } from 'remeda';
import { areFileDescriptionEqual } from './equal.ts';
import type { FileDescription } from './file-description.ts';

export const fileDescriptionComparisonStatus = {
    equal: 'equal',
    notEqual: 'not-equal'
} as const;

type FileDescriptionsComparisonResult = {
    readonly status: (typeof fileDescriptionComparisonStatus)[keyof typeof fileDescriptionComparisonStatus];
};

export function compareFileDescriptions(
    fileDescriptionsA: readonly FileDescription[],
    fileDescriptionsB: readonly FileDescription[]
): FileDescriptionsComparisonResult {
    if (fileDescriptionsA.length !== fileDescriptionsB.length) {
        return { status: fileDescriptionComparisonStatus.notEqual };
    }

    const byFilePath = function (fileDescription: FileDescription): string {
        return fileDescription.filePath;
    };
    const sortedFileDescriptionsA = sortBy(fileDescriptionsA, byFilePath);
    const sortedFileDescriptionsB = sortBy(fileDescriptionsB, byFilePath);

    for (const [ index, fileDescriptionA ] of sortedFileDescriptionsA.entries()) {
        const fileDescriptionB = sortedFileDescriptionsB[index];

        if (fileDescriptionB === undefined || !areFileDescriptionEqual(fileDescriptionA, fileDescriptionB)) {
            return { status: fileDescriptionComparisonStatus.notEqual };
        }
    }

    return { status: fileDescriptionComparisonStatus.equal };
}
