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
    const { javaScript, declarationFile } = root;

    if (declarationFile !== undefined) {
        return {
            javaScript: ensureAbsolutePath(javaScript, sourceFolder),
            declarationFile: ensureAbsolutePath(declarationFile, sourceFolder)
        };
    }

    return {
        javaScript: ensureAbsolutePath(javaScript, sourceFolder)
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
