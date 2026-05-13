import path from 'node:path';
import type { AdditionalFileDescription } from '../config/additional-files.ts';
import type { Root } from '../config/root.ts';

function ensureAbsolutePath(filePath: string, folder: string): string {
    if (path.isAbsolute(filePath)) {
        return filePath;
    }

    return path.join(folder, filePath);
}

export function normalizeRoot(root: Root, sourceFolder: string): Root {
    const { js, declarationFile } = root;

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
