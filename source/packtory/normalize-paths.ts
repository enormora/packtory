import path from 'node:path';
import type { EntryPoint } from '../config/entry-point.js';
import type { AdditionalFileDescription } from '../config/additional-files.js';

function ensureAbsolutePath(filePath: string, folder: string): string {
    if (path.isAbsolute(filePath)) {
        return filePath;
    }

    return path.join(folder, filePath);
}

export function normalizeEntryPoint(entryPoint: EntryPoint, sourceFolder: string): EntryPoint {
    const { js, declarationFile } = entryPoint;

    if (declarationFile !== undefined) {
        return {
            js: ensureAbsolutePath(js, sourceFolder),
            declarationFile: ensureAbsolutePath(declarationFile, sourceFolder)
        };
    }

    return {
        js: ensureAbsolutePath(js, sourceFolder)
    };
}

export function normalizeAdditionalFile(
    additionalFile: AdditionalFileDescription,
    sourceFolder: string
): AdditionalFileDescription {
    return {
        sourceFilePath: ensureAbsolutePath(additionalFile.sourceFilePath, sourceFolder),
        targetFilePath: additionalFile.targetFilePath
    };
}
