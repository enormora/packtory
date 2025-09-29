import type { FileDescription } from './file-description.ts';

export function areFileDescriptionEqual(first: FileDescription, second: FileDescription): boolean {
    return (
        first.filePath === second.filePath &&
        first.content === second.content &&
        first.isExecutable === second.isExecutable
    );
}
