import type { FileDescription } from './file-description.ts';

function shouldShiftFileDescription(
    previousFileDescription: FileDescription | undefined,
    currentFileDescription: FileDescription
): previousFileDescription is FileDescription {
    return previousFileDescription !== undefined && previousFileDescription.filePath > currentFileDescription.filePath;
}

function insertFileDescription(
    sortedFileDescriptions: readonly FileDescription[],
    index: number,
    currentFileDescription: FileDescription
): FileDescription[] {
    const nextSortedFileDescriptions = Array.from(sortedFileDescriptions);
    let insertionIndex = index;
    let previousFileDescription = nextSortedFileDescriptions[insertionIndex - 1];

    while (shouldShiftFileDescription(previousFileDescription, currentFileDescription)) {
        nextSortedFileDescriptions[insertionIndex] = previousFileDescription;
        insertionIndex -= 1;
        previousFileDescription = nextSortedFileDescriptions[insertionIndex - 1];
    }

    nextSortedFileDescriptions[insertionIndex] = currentFileDescription;
    return nextSortedFileDescriptions;
}

export function sortByFilePath(fileDescriptions: readonly FileDescription[]): readonly FileDescription[] {
    let sortedFileDescriptions = Array.from(fileDescriptions);
    let index = 1;

    for (const currentFileDescription of sortedFileDescriptions.slice(1)) {
        sortedFileDescriptions = insertFileDescription(sortedFileDescriptions, index, currentFileDescription);
        index += 1;
    }

    return sortedFileDescriptions;
}
