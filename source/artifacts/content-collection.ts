import path from 'node:path';
import type { FileDescription } from '../file-manager/file-description.ts';
import { explicitBinTargetPaths, type ArtifactSourcePackage } from '../published-package/published-package.ts';

function applyPrefix(filePath: string, prefix: string | undefined): string {
    return prefix === undefined ? filePath : path.join(prefix, filePath);
}

export function collectArtifactContents(
    bundle: ArtifactSourcePackage,
    prefix: string | undefined,
    extraFiles: readonly FileDescription[]
): readonly FileDescription[] {
    const binTargets = explicitBinTargetPaths(bundle);
    const artifactContents: FileDescription[] = [
        {
            ...bundle.manifestFile,
            filePath: applyPrefix(bundle.manifestFile.filePath, prefix)
        }
    ];

    for (const entry of bundle.contents) {
        artifactContents.push({
            filePath: applyPrefix(entry.fileDescription.targetFilePath, prefix),
            content: entry.fileDescription.content,
            isExecutable: entry.fileDescription.isExecutable || binTargets.has(entry.fileDescription.targetFilePath)
        });
    }

    for (const extraFile of extraFiles) {
        artifactContents.push({
            filePath: applyPrefix(extraFile.filePath, prefix),
            content: extraFile.content,
            isExecutable: extraFile.isExecutable
        });
    }

    return artifactContents;
}

export function describeArtifactsForReport(
    bundle: ArtifactSourcePackage,
    prefix: string | undefined,
    extraFiles: readonly FileDescription[]
): readonly {
    readonly filePath: string;
    readonly content: string;
    readonly isExecutable: boolean;
    readonly sourceFilePath?: string;
    readonly isSubstituted?: boolean;
}[] {
    return [
        {
            ...bundle.manifestFile,
            filePath: applyPrefix(bundle.manifestFile.filePath, prefix)
        },
        ...bundle.contents.map((entry) => {
            return {
                filePath: applyPrefix(entry.fileDescription.targetFilePath, prefix),
                content: entry.fileDescription.content,
                isExecutable: entry.fileDescription.isExecutable,
                sourceFilePath: entry.fileDescription.sourceFilePath,
                isSubstituted: entry.isSubstituted
            };
        }),
        ...extraFiles.map((entry) => {
            return {
                ...entry,
                filePath: applyPrefix(entry.filePath, prefix)
            };
        })
    ];
}
