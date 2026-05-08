import type { LinkedBundle } from '../linker/linked-bundle.ts';
import { bundleResource, linkedBundle } from './bundle-fixtures.ts';

export function checkBundle(name: string, filePaths: readonly string[]): LinkedBundle {
    return linkedBundle({
        name,
        contents: filePaths.map((filePath) => {
            return { ...bundleResource(filePath, { targetFilePath: filePath }), isSubstituted: false };
        })
    });
}
