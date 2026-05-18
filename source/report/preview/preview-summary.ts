import type { PackageReport } from '../aggregator/report-types.ts';
import type { PreviewArtifactNode } from './artifact-tree-builder.ts';

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
    readonly tree: readonly PreviewArtifactNode[];
};

function countTreeArtifacts(tree: readonly PreviewArtifactNode[]): {
    readonly emitted: number;
    readonly changed: number;
} {
    let emitted = 0;
    let changed = 0;
    for (const entry of tree) {
        if (entry.type === 'file') {
            emitted += 1;
            if (entry.artifact.status === 'changed') {
                changed += 1;
            }
        }
    }
    return { emitted, changed };
}

function classifyStateCounts(packages: readonly PackageForSummary[]): {
    readonly changedPackages: number;
    readonly unchangedPackages: number;
    readonly failedPackages: number;
} {
    let changedPackages = 0;
    let unchangedPackages = 0;
    let failedPackages = 0;
    for (const pkg of packages) {
        if (pkg.hasChanges) {
            changedPackages += 1;
        } else if (pkg.failure === undefined) {
            unchangedPackages += 1;
        }
        if (pkg.failure !== undefined) {
            failedPackages += 1;
        }
    }
    return { changedPackages, unchangedPackages, failedPackages };
}

function aggregateArtifactCounts(packages: readonly PackageForSummary[]): {
    readonly emittedArtifacts: number;
    readonly changedArtifacts: number;
    readonly eliminatedSourceFiles: number;
} {
    let emittedArtifacts = 0;
    let changedArtifacts = 0;
    let eliminatedSourceFiles = 0;
    for (const pkg of packages) {
        eliminatedSourceFiles += pkg.eliminatedSourceFiles.length;
        const counts = countTreeArtifacts(pkg.tree);
        emittedArtifacts += counts.emitted;
        changedArtifacts += counts.changed;
    }
    return { emittedArtifacts, changedArtifacts, eliminatedSourceFiles };
}

export function summarizePackages(packages: readonly PackageForSummary[]): PreviewSummary {
    const stateCounts = classifyStateCounts(packages);
    const artifactCounts = aggregateArtifactCounts(packages);
    return {
        totalPackages: packages.length,
        ...stateCounts,
        ...artifactCounts
    };
}
