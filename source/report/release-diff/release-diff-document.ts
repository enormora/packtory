import type { BuildReport } from '../aggregator/report-types.ts';
import {
    getIssues,
    getResultType,
    isPreviewableResult,
    type PreviewResultType
} from '../preview/preview-result-inspectors.ts';
import type { ReleaseDiffAllResult } from '../../packtory/packtory-results.ts';
import type { PackageReleaseDiff } from './file-set-diff.ts';
import { summarizeReleaseDiff, type ReleaseDiffSummary } from './release-diff-summary.ts';

export type ReleaseDiffDocument = {
    readonly title: string;
    readonly modeLabel: string;
    readonly previewable: boolean;
    readonly resultType: PreviewResultType;
    readonly summary: ReleaseDiffSummary;
    readonly packages: readonly PackageReleaseDiff[];
    readonly issues: readonly string[];
    readonly report: BuildReport;
};

type ReleaseDiffDocumentParams = {
    readonly report: BuildReport;
    readonly result: ReleaseDiffAllResult;
    readonly packages: readonly PackageReleaseDiff[];
};

function countFailedPackages(report: BuildReport): number {
    let failedPackages = 0;

    for (const pkg of Object.values(report.packages)) {
        if (pkg.failure !== undefined) {
            failedPackages += 1;
        }
    }

    return failedPackages;
}

export function buildReleaseDiffDocument(params: ReleaseDiffDocumentParams): ReleaseDiffDocument {
    const { report, result, packages } = params;
    const failedPackages = countFailedPackages(report);
    return {
        title: 'Packtory release diff',
        modeLabel: 'vs registry latest',
        previewable: isPreviewableResult(result),
        resultType: getResultType(result),
        summary: summarizeReleaseDiff(packages, failedPackages),
        packages,
        issues: getIssues(result),
        report
    };
}
