import path from 'node:path';
import type { AdditionalFileDescription } from '../configuration/additional-files.ts';
import type { Root } from '../configuration/root.ts';

function ensureAbsolutePath(filePath: string, folder: string): string {
    if (path.isAbsolute(filePath)) {
        return filePath;
    }

    return path.join(folder, filePath);
}

export function normalizeRoot(root: Root, sourceFolder: string): Root {
    if (root.json !== undefined) {
        return { json: ensureAbsolutePath(root.json, sourceFolder) };
    }
    if (root.javaScript === undefined) {
        return { declarationFile: ensureAbsolutePath(root.declarationFile, sourceFolder) };
    }
    return {
        javaScript: ensureAbsolutePath(root.javaScript, sourceFolder),
        ...root.declarationFile === undefined ? {} : {
            declarationFile: ensureAbsolutePath(root.declarationFile, sourceFolder)
        }
    };
}

export function normalizeAdditionalFile(
    additionalFile: AdditionalFileDescription,
    sourceFolder: string
): AdditionalFileDescription {
    return {
        inputFilePath: ensureAbsolutePath(additionalFile.inputFilePath, sourceFolder),
        targetFilePath: additionalFile.targetFilePath
    };
}
