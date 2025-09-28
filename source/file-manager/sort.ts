import type { FileDescription } from './file-description.js';

type LowerThan = -1;
type Equals = 0;
type GreaterThan = 1;
type ComparisonResult = Equals | GreaterThan | LowerThan;

function compareFilePath(first: FileDescription, second: FileDescription): ComparisonResult {
    if (first.filePath < second.filePath) {
        return -1;
    }
    if (first.filePath > second.filePath) {
        return 1;
    }
    return 0;
}

export function sortByFilePath(fileDescriptions: readonly FileDescription[]): readonly FileDescription[] {
    return Array.from(fileDescriptions).toSorted(compareFilePath);
}
