import path from 'node:path';
import type { PullRequestChangedFile } from '@pr-log/core';
import { releaseAnalysisClassification, type ReleasePlanPackage } from './packtory-results.ts';

export type ChangelogSourceFileHistoryInput = {
    readonly changedFilesByPullRequest: ReadonlyMap<number, readonly PullRequestChangedFile[]>;
    readonly packagePlan: ReleasePlanPackage;
    readonly sourceFileRoots: readonly string[];
};

function normalizeRepositoryPath(filePath: string): string {
    return filePath.split(path.sep).join('/').replace(/^\/+/u, '');
}

function previousPathFor(file: PullRequestChangedFile): string | undefined {
    return file.previousPath === undefined ? undefined : normalizeRepositoryPath(file.previousPath);
}

function pathFor(file: PullRequestChangedFile): string {
    return normalizeRepositoryPath(file.path);
}

function isDeletedFile(file: PullRequestChangedFile): boolean {
    return file.status === 'removed' || file.status === 'deleted';
}

function sourceRootFromSourceFile(filePath: string): string {
    return filePath.split('/').slice(0, -1).join('/');
}

function collectDerivedSourceFileRoots(packagePlan: ReleasePlanPackage): readonly string[] {
    const sourceFileRoots = new Set<string>();
    if (packagePlan.releaseClassification !== releaseAnalysisClassification.dependencyOnly) {
        for (const sourceFile of packagePlan.changelogSourceFiles) {
            const sourceRoot = sourceRootFromSourceFile(normalizeRepositoryPath(sourceFile));
            if (sourceRoot !== '') {
                sourceFileRoots.add(sourceRoot);
            }
        }
    }
    return Array.from(sourceFileRoots);
}

function historicalSourceFileRoots(input: ChangelogSourceFileHistoryInput): readonly string[] {
    return Array.from(
        new Set([
            ...input.sourceFileRoots.map(normalizeRepositoryPath),
            ...collectDerivedSourceFileRoots(input.packagePlan)
        ])
    );
}

function isHistoricalPath(filePath: string, roots: readonly string[]): boolean {
    return roots.some(function (root) {
        return root === '' || filePath.startsWith(`${root}/`);
    });
}

function fileTouchesTarget(file: PullRequestChangedFile, targetSourceFiles: ReadonlySet<string>): boolean {
    return targetSourceFiles.has(pathFor(file));
}

function pullRequestTouchesTarget(
    changedFiles: readonly PullRequestChangedFile[],
    targetSourceFiles: ReadonlySet<string>
): boolean {
    return changedFiles.some(function (file) {
        return fileTouchesTarget(file, targetSourceFiles);
    });
}

function renamedFilePaths(file: PullRequestChangedFile, targetSourceFiles: ReadonlySet<string>): readonly string[] {
    const currentPath = pathFor(file);
    const previousPath = previousPathFor(file);
    if (previousPath === undefined) {
        return [];
    }
    return [
        ...targetSourceFiles.has(currentPath) ? [ previousPath ] : [],
        ...targetSourceFiles.has(previousPath) ? [ currentPath ] : []
    ];
}

function expandRenamedFiles(
    targetSourceFiles: ReadonlySet<string>,
    changedFiles: readonly PullRequestChangedFile[]
): ReadonlySet<string> {
    return new Set([
        ...targetSourceFiles,
        ...changedFiles.flatMap(function (file) {
            return renamedFilePaths(file, targetSourceFiles);
        })
    ]);
}

function expandRenameHistory(
    targetSourceFiles: ReadonlySet<string>,
    changedFiles: readonly PullRequestChangedFile[]
): ReadonlySet<string> {
    return changedFiles.reduce(function (expandedSoFar) {
        return expandRenamedFiles(expandedSoFar, changedFiles);
    }, targetSourceFiles);
}

function addDeletedFilesFromTargetPullRequests(
    targetSourceFiles: ReadonlySet<string>,
    changedFilesByPullRequest: ChangelogSourceFileHistoryInput['changedFilesByPullRequest'],
    sourceFileRoots: readonly string[]
): ReadonlySet<string> {
    const expanded = new Set(targetSourceFiles);
    for (const changedFiles of changedFilesByPullRequest.values()) {
        if (pullRequestTouchesTarget(changedFiles, targetSourceFiles)) {
            for (const file of changedFiles) {
                const filePath = pathFor(file);
                if (isDeletedFile(file) && isHistoricalPath(filePath, sourceFileRoots)) {
                    expanded.add(filePath);
                }
            }
        }
    }
    return expanded;
}

function addPureDeletedFiles(
    targetSourceFiles: ReadonlySet<string>,
    changedFiles: readonly PullRequestChangedFile[],
    sourceFileRoots: readonly string[]
): ReadonlySet<string> {
    const expanded = new Set(targetSourceFiles);
    for (const file of changedFiles) {
        const filePath = pathFor(file);
        if (isDeletedFile(file) && isHistoricalPath(filePath, sourceFileRoots)) {
            expanded.add(filePath);
        }
    }
    return expanded;
}

function shouldAttributePureDeletes(packagePlan: ReleasePlanPackage): boolean {
    return packagePlan.releaseClassification !== releaseAnalysisClassification.dependencyOnly;
}

export function expandChangelogSourceFilesForHistory(input: ChangelogSourceFileHistoryInput): readonly string[] {
    const sourceFileRoots = historicalSourceFileRoots(input);
    const changedFiles = Array.from(input.changedFilesByPullRequest.values()).flat();
    const renamedSourceFiles = expandRenameHistory(
        new Set(input.packagePlan.changelogSourceFiles.map(normalizeRepositoryPath)),
        changedFiles
    );
    const targetSourceFiles = addDeletedFilesFromTargetPullRequests(
        renamedSourceFiles,
        input.changedFilesByPullRequest,
        sourceFileRoots
    );

    return Array.from(
        shouldAttributePureDeletes(input.packagePlan)
            ? addPureDeletedFiles(targetSourceFiles, changedFiles, sourceFileRoots)
            : targetSourceFiles
    );
}
