import path from 'node:path';
import { Maybe } from 'true-myth';
import type { FileManager } from '../file-manager/file-manager.ts';

export type SourceMapFileLocatorDependencies = {
    readonly fileManager: FileManager;
};

export type SourceMapFileLocator = {
    locate: (sourceFile: string) => Promise<Maybe<string>>;
};

function getSourceMappingUrl(fileContent: string): string | undefined {
    for (const line of fileContent.split('\n')) {
        if (line.startsWith('//# sourceMappingURL=')) {
            const sourceMappingUrl = line.slice('//# sourceMappingURL='.length);
            return sourceMappingUrl === '' ? undefined : sourceMappingUrl;
        }
    }

    return undefined;
}

export function createSourceMapFileLocator(
    dependencies: Readonly<SourceMapFileLocatorDependencies>
): SourceMapFileLocator {
    const { fileManager } = dependencies;

    return {
        async locate(sourceFile) {
            const fileContent = await fileManager.readFile(sourceFile);
            const sourceMappingUrl = getSourceMappingUrl(fileContent);

            if (sourceMappingUrl !== undefined) {
                const folder = path.dirname(sourceFile);
                const sourceMappingFile = path.join(folder, sourceMappingUrl);
                const { isReadable } = await fileManager.checkReadability(sourceMappingFile);

                if (isReadable) {
                    return Maybe.just(sourceMappingFile);
                }
            }

            return Maybe.nothing();
        }
    };
}
