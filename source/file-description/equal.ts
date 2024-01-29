import type { FileDescription } from './file-description.js';

export function areFileDescriptionEqual(first: FileDescription, second: FileDescription): boolean {
    return first.filePath === second.filePath && first.content === second.content;
}
