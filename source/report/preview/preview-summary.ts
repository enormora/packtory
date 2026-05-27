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
    readonly eliminatedSourceFiles: readonly { readonly path: string }[];
    readonly artifactCounts: {
        readonly emitted: number;
        readonly changed: number;
    };
};

type MutablePreviewSummary = {
    -readonly [Key in keyof PreviewSummary]: PreviewSummary[Key];
};

function createPreviewSummary(totalPackages: number): MutablePreviewSummary {
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
    const summary = createPreviewSummary(packages.length);
    for (const pkg of packages) {
        summary.changedPackages += pkg.hasChanges ? 1 : 0;
        summary.unchangedPackages += !pkg.hasChanges && pkg.failure === undefined ? 1 : 0;
        summary.failedPackages += pkg.failure === undefined ? 0 : 1;
        summary.emittedArtifacts += pkg.artifactCounts.emitted;
        summary.changedArtifacts += pkg.artifactCounts.changed;
        summary.eliminatedSourceFiles += pkg.eliminatedSourceFiles.length;
    }
    return summary;
}
