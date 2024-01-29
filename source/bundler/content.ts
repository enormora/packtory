import path from 'node:path';
import type { LocalFile } from '../dependency-scanner/dependency-graph.js';
import { serializePackageJson } from '../package-json.js';
import type { AdditionalFileDescription } from '../config/additional-files.js';
import type { BundleContent, BundlePackageJson } from './bundle-description.js';

function prependSourcesFolderIfNecessary(sourcesFolder: string, filePath: string): string {
    if (!path.isAbsolute(filePath)) {
        return path.join(sourcesFolder, filePath);
    }

    return filePath;
}

export function combineAllPackageFiles(
    sourcesFolder: string,
    localDependencies: readonly LocalFile[],
    packageJson: BundlePackageJson,
    additionalFiles: readonly (AdditionalFileDescription | string)[] = []
): readonly BundleContent[] {
    const referenceContents = localDependencies.map((localFile): BundleContent => {
        const targetFilePath = path.relative(sourcesFolder, localFile.filePath);

        if (localFile.substitutionContent.isJust) {
            return {
                kind: 'substituted',
                sourceFilePath: localFile.filePath,
                targetFilePath,
                source: localFile.substitutionContent.value
            };
        }

        return {
            kind: 'reference',
            sourceFilePath: localFile.filePath,
            targetFilePath
        };
    });
    const additionalContents = additionalFiles.map((additionalFile): BundleContent => {
        if (typeof additionalFile === 'string') {
            return {
                kind: 'reference',
                sourceFilePath: path.join(sourcesFolder, additionalFile),
                targetFilePath: additionalFile
            };
        }

        if (path.isAbsolute(additionalFile.targetFilePath)) {
            throw new Error('The targetFilePath must be relative');
        }

        return {
            kind: 'reference',
            sourceFilePath: prependSourcesFolderIfNecessary(sourcesFolder, additionalFile.sourceFilePath),
            targetFilePath: additionalFile.targetFilePath
        };
    });

    return [
        {
            kind: 'source',
            source: serializePackageJson(packageJson),
            targetFilePath: 'package.json'
        },
        ...referenceContents,
        ...additionalContents
    ];
}
