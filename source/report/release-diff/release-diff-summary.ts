import { packageReleaseDiffState, type PackageReleaseDiffStateView } from './file-set-diff.ts';

export type ReleaseDiffSummary = {
    readonly totalPackages: number;
    readonly changedPackages: number;
    readonly firstPublishPackages: number;
    readonly unchangedPackages: number;
    readonly failedPackages: number;
    readonly addedFiles: number;
    readonly removedFiles: number;
    readonly modifiedFiles: number;
};

function classifyStateCounts(packages: readonly PackageReleaseDiffStateView[]): {
    readonly changedPackages: number;
    readonly firstPublishPackages: number;
    readonly unchangedPackages: number;
} {
    let changedPackages = 0;
    let firstPublishPackages = 0;
    let unchangedPackages = 0;
    for (const pkg of packages) {
        if (pkg.state === packageReleaseDiffState.changed) {
            changedPackages += 1;
        } else if (pkg.state === packageReleaseDiffState.firstPublish) {
            firstPublishPackages += 1;
        } else {
            unchangedPackages += 1;
        }
    }
    return { changedPackages, firstPublishPackages, unchangedPackages };
}

function aggregateFileCounts(packages: readonly PackageReleaseDiffStateView[]): {
    readonly addedFiles: number;
    readonly removedFiles: number;
    readonly modifiedFiles: number;
} {
    let addedFiles = 0;
    let removedFiles = 0;
    let modifiedFiles = 0;
    for (const pkg of packages) {
        addedFiles += pkg.files.added.length;
        removedFiles += pkg.files.removed.length;
        modifiedFiles += pkg.files.modified.length;
    }
    return { addedFiles, removedFiles, modifiedFiles };
}

export function summarizeReleaseDiff(
    packages: readonly PackageReleaseDiffStateView[],
    failedPackages: number
): ReleaseDiffSummary {
    const stateCounts = classifyStateCounts(packages);
    const fileCounts = aggregateFileCounts(packages);
    return {
        totalPackages: packages.length + failedPackages,
        ...stateCounts,
        failedPackages,
        ...fileCounts
    };
}
