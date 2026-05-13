/* eslint-disable max-statements, complexity -- preview document construction intentionally combines reporting, diffing, and tree shaping */
import { readFile } from 'node:fs/promises';
import type { PublishAllResult } from '../packtory/packtory.ts';
import type { ArtifactBadge, ArtifactStatus, EliminatedSourceFile } from '../progress/progress-broadcaster.ts';
import type { BuildReport, PackageReport } from './report-aggregator.ts';
import {
    buildArtifactTree,
    buildBundleArtifactIndex,
    buildDiffForArtifact,
    buildVersionTransition,
    getIssues,
    getResultType,
    getSucceededResults,
    hasMeaningfulChanges,
    isPreviewableResult,
    type PreviewArtifact,
    type PreviewArtifactNode,
    type PreviewResultType
} from './preview-document-helpers.ts';

export type PreviewPackage = {
    readonly name: string;
    readonly versionTransition?: string | undefined;
    readonly hasChanges: boolean;
    readonly openByDefault: boolean;
    readonly tree: readonly PreviewArtifactNode[];
    readonly eliminatedSourceFiles: readonly EliminatedSourceFile[];
    readonly failure?: PackageReport['failure'];
    readonly diagnostics: PackageReport;
};

type PreviewSummary = {
    readonly totalPackages: number;
    readonly changedPackages: number;
    readonly unchangedPackages: number;
    readonly failedPackages: number;
    readonly emittedArtifacts: number;
    readonly changedArtifacts: number;
    readonly eliminatedSourceFiles: number;
};

export type PreviewDocument = {
    readonly title: string;
    readonly modeLabel: string;
    readonly previewable: boolean;
    readonly resultType: PreviewResultType;
    readonly summary: PreviewSummary;
    readonly packages: readonly PreviewPackage[];
    readonly issues: readonly string[];
    readonly report: BuildReport;
};

type PreviewDocumentParams = {
    readonly report: BuildReport;
    readonly result: PublishAllResult;
    readonly dryRun: boolean;
    readonly readWorkspaceFile?: ((filePath: string) => Promise<string>) | undefined;
};

export async function buildPreviewDocument(params: PreviewDocumentParams): Promise<PreviewDocument> {
    const readWorkspaceFile =
        params.readWorkspaceFile ??
        (async (filePath: string) => {
            return readFile(filePath, 'utf8');
        });
    const bundleArtifactIndex = buildBundleArtifactIndex(getSucceededResults(params.result));
    const packageEntries = Object.entries(params.report.packages);
    const packages: PreviewPackage[] = [];

    for (const [packageName, packageReport] of packageEntries) {
        const emittedArtifacts = packageReport.outputs?.tarball.entries ?? [];
        const artifacts = await Promise.all(
            emittedArtifacts.map(async (artifact): Promise<PreviewArtifact> => {
                const diff = await buildDiffForArtifact(packageName, artifact, bundleArtifactIndex, readWorkspaceFile);
                return {
                    ...artifact,
                    ...(diff === undefined ? {} : { diff })
                };
            })
        );
        const eliminatedSourceFiles = packageReport.eliminatedSourceFiles ?? [];
        const hasChanges = hasMeaningfulChanges(artifacts, eliminatedSourceFiles);
        packages.push({
            name: packageName,
            versionTransition: buildVersionTransition(packageReport),
            hasChanges,
            openByDefault: hasChanges || packageReport.failure !== undefined,
            tree: buildArtifactTree(artifacts),
            eliminatedSourceFiles,
            failure: packageReport.failure,
            diagnostics: packageReport
        });
    }

    let totalPackages = 0;
    let changedPackages = 0;
    let unchangedPackages = 0;
    let failedPackages = 0;
    let emittedArtifacts = 0;
    let changedArtifacts = 0;
    let eliminatedSourceFiles = 0;
    for (const pkg of packages) {
        totalPackages += 1;
        if (pkg.hasChanges) {
            changedPackages += 1;
        } else if (pkg.failure === undefined) {
            unchangedPackages += 1;
        }
        if (pkg.failure !== undefined) {
            failedPackages += 1;
        }
        eliminatedSourceFiles += pkg.eliminatedSourceFiles.length;
        for (const entry of pkg.tree) {
            if (entry.type === 'file') {
                emittedArtifacts += 1;
                if (entry.artifact.status === 'changed') {
                    changedArtifacts += 1;
                }
            }
        }
    }
    const summary: PreviewSummary = {
        totalPackages,
        changedPackages,
        unchangedPackages,
        failedPackages,
        emittedArtifacts,
        changedArtifacts,
        eliminatedSourceFiles
    };

    return {
        title: 'Packtory preview',
        modeLabel: params.dryRun ? 'Dry run' : 'Publish',
        previewable: isPreviewableResult(params.result),
        resultType: getResultType(params.result),
        summary,
        packages,
        issues: getIssues(params.result),
        report: params.report
    };
}

export function artifactStatusLabel(status: ArtifactStatus): string {
    if (status === 'generated') {
        return 'generated';
    }
    if (status === 'changed') {
        return 'changed';
    }
    return 'unchanged';
}

export function artifactBadgeLabel(badge: ArtifactBadge): string {
    if (badge === 'dead-code-elimination') {
        return 'DCE';
    }
    return 'rewrite';
}
