import path from 'node:path';
import { Maybe } from 'true-myth';
import type { FileManager } from '../file-manager/file-manager.ts';

export type SourceMapFileLocatorDependencies = {
    readonly fileManager: FileManager;
};

export type SourceMapFileLocator = {
    locate: (sourceFile: string, sourcesFolder: string) => Promise<Maybe<string>>;
};

function sourceMappingAddressPrefix(): string {
    return '//# sourceMappingURL=';
}

function getSourceMappingAddress(fileContent: string): string | undefined {
    const prefix = sourceMappingAddressPrefix();
    for (const line of fileContent.split('\n')) {
        if (line.startsWith(prefix)) {
            const sourceMappingAddress = line.slice(prefix.length);
            return sourceMappingAddress;
        }
    }

    return undefined;
}

function isAddressLike(filePath: string): boolean {
    return /^[a-z][\d+.a-z-]*:/iu.test(filePath);
}

function isRelativeMapFilePath(filePath: string): boolean {
    if (path.posix.isAbsolute(filePath) || path.win32.isAbsolute(filePath)) {
        return false;
    }
    if (isAddressLike(filePath) || filePath.includes('?') || filePath.includes('#')) {
        return false;
    }
    return path.extname(filePath) === '.map';
}

function isInFolder(folder: string, candidate: string): boolean {
    const relativePath = path.relative(folder, candidate);
    return relativePath.length > 0 && !relativePath.startsWith('..') && !path.isAbsolute(relativePath);
}

function resolveSourceMapFile(sourceFile: string, sourcesFolder: string, sourceMappingAddress: string): Maybe<string> {
    if (!isRelativeMapFilePath(sourceMappingAddress)) {
        return Maybe.nothing();
    }

    const sourceMapFile = path.resolve(path.dirname(sourceFile), sourceMappingAddress);
    return isInFolder(path.resolve(sourcesFolder), sourceMapFile) ? Maybe.just(sourceMapFile) : Maybe.nothing();
}

export function createSourceMapFileLocator(
    dependencies: Readonly<SourceMapFileLocatorDependencies>
): SourceMapFileLocator {
    const { fileManager } = dependencies;

    async function isReadableSourceMap(sourcesFolder: string, sourceMapFile: string): Promise<boolean> {
        const { isReadable } = await fileManager.checkReadability(sourceMapFile);
        if (!isReadable) {
            return false;
        }

        const realSourcesFolder = await fileManager.getRealPath(sourcesFolder);
        const realSourceMapFile = await fileManager.getRealPath(sourceMapFile);
        return isInFolder(realSourcesFolder, realSourceMapFile);
    }

    return {
        async locate(sourceFile, sourcesFolder) {
            const fileContent = await fileManager.readFile(sourceFile);
            const sourceMappingAddress = getSourceMappingAddress(fileContent);

            if (sourceMappingAddress === undefined) {
                return Maybe.nothing();
            }

            const sourceMapFile = resolveSourceMapFile(sourceFile, sourcesFolder, sourceMappingAddress);
            if (sourceMapFile.isNothing) {
                return Maybe.nothing();
            }

            return await isReadableSourceMap(sourcesFolder, sourceMapFile.value)
                ? Maybe.just(sourceMapFile.value)
                : Maybe.nothing();
        }
    };
}
