import type { AnalyzedBundle } from '../dead-code-eliminator/analyzed-bundle.ts';
import { analyzedBundle, analyzedBundleResource } from './bundle-fixtures.ts';

export function checkBundle(name: string, filePaths: readonly string[]): AnalyzedBundle {
    return analyzedBundle({
        name,
        contents: filePaths.map(function (filePath) {
            return analyzedBundleResource(filePath, { targetFilePath: filePath });
        })
    });
}
