import type { FileManager } from '../../file-manager/file-manager.ts';
import type { PublishAllResult } from '../../packtory/packtory.ts';
import type { ArtifactBadge, ArtifactStatus, EliminatedSourceFile } from '../../progress/progress-broadcaster.ts';
import type { BuildReport, PackageReport } from '../aggregator/report-types.ts';
import { buildDiffForArtifact } from './artifact-diff-builder.ts';
import { buildArtifactTree, type PreviewArtifact, type PreviewArtifactNode } from './artifact-tree-builder.ts';
import { buildBundleArtifactIndex, type BundleArtifactIndex } from './bundle-artifact-index.ts';
import { buildVersionTransition, hasMeaningfulChanges } from './preview-document-helpers.ts';
import {
    getIssues,
    getResultType,
    getSucceededResults,
    isPreviewableResult,
    type PreviewResultType
} from './preview-result-inspectors.ts';
import { summarizePackages, type PreviewSummary } from './preview-summary.ts';

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

async function buildPreviewPackage(
    packageName: string,
    packageReport: PackageReport,
    bundleArtifactIndex: BundleArtifactIndex,
    readWorkspaceFile: (filePath: string) => Promise<string>
): Promise<PreviewPackage> {
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
    return {
        name: packageName,
        versionTransition: buildVersionTransition(packageReport),
        hasChanges,
        openByDefault: hasChanges || packageReport.failure !== undefined,
        tree: buildArtifactTree(artifacts),
        eliminatedSourceFiles,
        failure: packageReport.failure,
        diagnostics: packageReport
    };
}

export async function buildPreviewDocument(params: PreviewDocumentParams): Promise<PreviewDocument> {
    const readWorkspaceFile = params.fileManager.readFile;
    const bundleArtifactIndex = buildBundleArtifactIndex(getSucceededResults(params.result));
    const packageEntries = Object.entries(params.report.packages);
    const packages = await Promise.all(
        packageEntries.map(async ([packageName, packageReport]) => {
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
