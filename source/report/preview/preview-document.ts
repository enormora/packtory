import type { FileManager } from '../../file-manager/file-manager.ts';
import type { PublishAllResult } from '../../packtory/packtory.ts';
import type { ArtifactBadge, ArtifactStatus } from '../../progress/progress-broadcaster.ts';
import type { BuildReport } from '../aggregator/report-types.ts';
import type { PreviewPackage } from './preview-package-types.ts';
import { buildPreviewPackage } from './preview-package.ts';
import { buildBundleArtifactIndex } from './bundle-artifact-index.ts';
import {
    getIssues,
    getResultType,
    getSucceededResults,
    isPreviewableResult,
    type PreviewResultType
} from './preview-result-inspectors.ts';
import { summarizePackages, type PreviewSummary } from './preview-summary.ts';

export type PreviewDocument = {
    readonly selectedPackage?: string | undefined;
    readonly allFiles?: boolean;
    readonly title: string;
    readonly modeLabel: string;
    readonly previewable: boolean;
    readonly resultType: PreviewResultType;
    readonly summary: PreviewSummary;
    readonly packages: readonly PreviewPackage[];
    readonly issues: readonly string[];
    readonly report: BuildReport;
};

type PreviewDocumentInput = {
    readonly report: BuildReport;
    readonly result: PublishAllResult;
    readonly dryRun: boolean;
    readonly fileManager: Pick<FileManager, 'readFile'>;
};

export async function buildPreviewDocument(input: PreviewDocumentInput): Promise<PreviewDocument> {
    const readWorkspaceFile = input.fileManager.readFile;
    const bundleArtifactIndex = buildBundleArtifactIndex(getSucceededResults(input.result));
    const packages = await Promise.all(
        Object.entries(input.report.packages).map(async function ([ packageName, packageReport ]) {
            return buildPreviewPackage(
                packageName,
                packageReport,
                bundleArtifactIndex,
                readWorkspaceFile
            );
        })
    );

    return {
        title: 'Packtory preview',
        modeLabel: input.dryRun ? 'Dry run' : 'Publish',
        previewable: isPreviewableResult(input.result),
        resultType: getResultType(input.result),
        summary: summarizePackages(packages),
        packages,
        issues: getIssues(input.result),
        report: input.report
    };
}

export function artifactStatusLabel(status: ArtifactStatus): string {
    return status;
}

export function artifactBadgeLabel(badge: ArtifactBadge): string {
    if (badge === 'dead-code-elimination') {
        return 'dead code elimination';
    }
    return 'rewrite';
}
