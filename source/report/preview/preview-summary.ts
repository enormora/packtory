import type { PackageReport } from '../aggregator/report-types.ts';

export type PreviewSummary = {
    readonly totalPackages: number;
    readonly changedPackages: number;
    readonly unchangedPackages: number;
    readonly failedPackages: number;
    readonly emittedArtifacts: number;
    readonly changedArtifacts: number;
    readonly eliminatedSourceFiles: number;
};

type PackageForSummary = {
    readonly hasChanges: boolean;
    readonly failure?: PackageReport['failure'];
    readonly eliminatedSourceFiles: readonly { readonly path: string; }[];
    readonly artifactCounts: {
        readonly emitted: number;
        readonly changed: number;
    };
};

function createPreviewSummary(totalPackages: number): PreviewSummary {
    return {
        totalPackages,
        changedPackages: 0,
        unchangedPackages: 0,
        failedPackages: 0,
        emittedArtifacts: 0,
        changedArtifacts: 0,
        eliminatedSourceFiles: 0
    };
}

export function summarizePackages(packages: readonly PackageForSummary[]): PreviewSummary {
    return packages.reduce(
        function (summary, pkg) {
            return {
                totalPackages: summary.totalPackages,
                changedPackages: summary.changedPackages + (pkg.hasChanges ? 1 : 0),
                unchangedPackages: summary.unchangedPackages + (!pkg.hasChanges && pkg.failure === undefined ? 1 : 0),
                failedPackages: summary.failedPackages + (pkg.failure === undefined ? 0 : 1),
                emittedArtifacts: summary.emittedArtifacts + pkg.artifactCounts.emitted,
                changedArtifacts: summary.changedArtifacts + pkg.artifactCounts.changed,
                eliminatedSourceFiles: summary.eliminatedSourceFiles + pkg.eliminatedSourceFiles.length
            };
        },
        createPreviewSummary(packages.length)
    );
}
