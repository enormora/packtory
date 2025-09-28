import path from 'node:path';
import { Maybe } from 'true-myth';
import type { FileManager } from '../file-manager/file-manager.js';

export type SourceMapFileLocatorDependencies = {
    readonly fileManager: FileManager;
};

export type SourceMapFileLocator = {
    locate: (sourceFile: string) => Promise<Maybe<string>>;
};

const sourceMappingUrlPattern = /^\/\/# sourceMappingURL=(?<url>.+)$/m;

export function createSourceMapFileLocator(
    dependencies: Readonly<SourceMapFileLocatorDependencies>
): SourceMapFileLocator {
    const { fileManager } = dependencies;

    return {
        async locate(sourceFile) {
            const fileContent = await fileManager.readFile(sourceFile);
            const result = sourceMappingUrlPattern.exec(fileContent);
            const sourceMappingUrl = result?.groups?.url;

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
