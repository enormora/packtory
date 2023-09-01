import fs from 'node:fs';
import path from 'node:path';
import {Maybe} from 'true-myth'

export interface SourceMapFileLocatorDependencies {
    readonly readFile: typeof fs.promises.readFile;
    readonly checkFileAccess: typeof fs.promises.access;
}

export interface SourceMapFileLocator {
    locate(sourceFile: string): Promise<Maybe<string>>;
}

interface FileReadability {
    isReadable: boolean;
}

const sourceMappingUrlPattern = /^\/\/# sourceMappingURL=(?<url>.+)$/m;

export function createSourceMapFileLocator(dependencies: SourceMapFileLocatorDependencies): SourceMapFileLocator {
    const {readFile, checkFileAccess} = dependencies;

    async function checkReadability(fileName: string): Promise<FileReadability> {
        try {
            await checkFileAccess(fileName, fs.constants.R_OK);
            return {isReadable: true};
        } catch {
            return {isReadable: false};
        }
    }

    return {
        async locate(sourceFile) {
            const fileContent = await readFile(sourceFile, {encoding: 'utf8'});
            const result = sourceMappingUrlPattern.exec(fileContent);
            const sourceMappingUrl = result?.groups?.url;

            if (sourceMappingUrl) {
                const folder = path.dirname(sourceFile);
                const sourceMappingFile = path.join(folder, sourceMappingUrl);
                const {isReadable} = await checkReadability(sourceMappingFile);

                if (isReadable) {
                    return Maybe.just(sourceMappingFile);
                }
            }

            return Maybe.nothing();
        }
    };
}
