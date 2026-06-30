import type { FileManager } from '../../file-manager/file-manager.ts';
import type { PublishAllResult } from '../../packtory/packtory.ts';
import type { ArtifactBadge, ArtifactStatus, EliminatedSourceFile } from '../../progress/progress-broadcaster.ts';
import type { BuildReport, PackageReport } from '../aggregator/report-types.ts';
import { buildDiffForArtifact } from './artifact-diff-builder.ts';
import { buildArtifactTree, type PreviewArtifact, type PreviewArtifactNode } from './artifact-tree-builder.ts';
import { buildBundleArtifactIndex, type BundleArtifactIndex } from './bundle-artifact-index.ts';
import { buildVersionTransition, hasMeaningfulChanges } from './preview-document-state.ts';
import {
    getIssues,
    getResultType,
    getSucceededResults,
    isPreviewableResult,
    type PreviewResultType
} from './preview-result-inspectors.ts';
import { summarizePackages, type PreviewSummary } from './preview-summary.ts';

export type ChangedPreviewArtifact = PreviewArtifact & {
    readonly diff: NonNullable<PreviewArtifact['diff']>;
};

type PreviewArtifactCounts = {
    readonly emitted: number;
    readonly changed: number;
};

export type PreviewPackage = {
    readonly name: string;
    readonly versionTransition?: string | undefined;
    readonly hasChanges: boolean;
    readonly openByDefault: boolean;
    readonly tree: readonly PreviewArtifactNode[];
    readonly changedArtifacts: readonly ChangedPreviewArtifact[];
    readonly artifactCounts: PreviewArtifactCounts;
    readonly eliminatedSourceFiles: readonly EliminatedSourceFile[];
    readonly failure?: PackageReport['failure'];
    readonly diagnostics: PackageReport;
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
    readonly fileManager: Pick<FileManager, 'readFile'>;
};

type PackageArtifactData = {
    readonly changedArtifacts: readonly ChangedPreviewArtifact[];
    readonly artifactCounts: PreviewArtifactCounts;
};

function collectPackageArtifactData(artifacts: readonly PreviewArtifact[]): PackageArtifactData {
    const changedArtifacts: ChangedPreviewArtifact[] = [];
    const emittedArtifacts = artifacts.length;
    let changedArtifactCount = 0;

    for (const artifact of artifacts) {
        if (artifact.status === 'changed') {
            changedArtifactCount += 1;
        }
        if (artifact.diff !== undefined) {
            changedArtifacts.push({ ...artifact, diff: artifact.diff });
        }
    }

    return {
        changedArtifacts,
        artifactCounts: {
            emitted: emittedArtifacts,
            changed: changedArtifactCount
        }
    };
}

async function buildPreviewArtifactWithDiff(
    packageName: string,
    artifact: PreviewArtifact,
    bundleArtifactIndex: BundleArtifactIndex,
    readWorkspaceFile: (filePath: string) => Promise<string>
): Promise<PreviewArtifact> {
    const diff = await buildDiffForArtifact(packageName, artifact, bundleArtifactIndex, readWorkspaceFile);
    if (diff === undefined) {
        return artifact;
    }
    return {
        ...artifact,
        diff
    };
}

async function buildPreviewPackage(
    packageName: string,
    packageReport: PackageReport,
    bundleArtifactIndex: BundleArtifactIndex,
    readWorkspaceFile: (filePath: string) => Promise<string>
): Promise<PreviewPackage> {
    const emittedArtifacts = packageReport.outputs?.tarball.entries ?? [];
    const artifacts = await Promise.all(
        emittedArtifacts.map(async function (artifact) {
            return buildPreviewArtifactWithDiff(packageName, artifact, bundleArtifactIndex, readWorkspaceFile);
        })
    );
    const eliminatedSourceFiles = packageReport.eliminatedSourceFiles ?? [];
    const hasChanges = hasMeaningfulChanges(artifacts, eliminatedSourceFiles);
    const tree = buildArtifactTree(artifacts);
    const { changedArtifacts, artifactCounts } = collectPackageArtifactData(artifacts);
    return {
        name: packageName,
        versionTransition: buildVersionTransition(packageReport),
        hasChanges,
        openByDefault: hasChanges || packageReport.failure !== undefined,
        tree,
        changedArtifacts,
        artifactCounts,
        eliminatedSourceFiles,
        failure: packageReport.failure,
        diagnostics: packageReport
    };
}

export async function buildPreviewDocument(params: PreviewDocumentParams): Promise<PreviewDocument> {
    const readWorkspaceFile = params.fileManager.readFile;
    const bundleArtifactIndex = buildBundleArtifactIndex(getSucceededResults(params.result));
    const packages = await Promise.all(
        Object.entries(params.report.packages).map(async function ([ packageName, packageReport ]) {
            return buildPreviewPackage(packageName, packageReport, bundleArtifactIndex, readWorkspaceFile);
        })
    );

    return {
        title: 'Packtory preview',
        modeLabel: params.dryRun ? 'Dry run' : 'Publish',
        previewable: isPreviewableResult(params.result),
        resultType: getResultType(params.result),
        summary: summarizePackages(packages),
        packages,
        issues: getIssues(params.result),
        report: params.report
    };
}

export function artifactStatusLabel(status: ArtifactStatus): string {
    return status;
}

export function artifactBadgeLabel(badge: ArtifactBadge): string {
    if (badge === 'dead-code-elimination') {
        return 'DCE';
    }
    return 'rewrite';
}
