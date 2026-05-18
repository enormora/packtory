import type { BuildReport, PackageReport } from '../aggregator/report-types.ts';
import type { PreviewResultType } from '../preview/preview-result-inspectors.ts';
import type { ReleaseDiffAllResult } from '../../packtory/packtory-results.ts';
import type { FileSetDiff } from './file-set-diff.ts';
import { summarizeReleaseDiff, type ReleaseDiffSummary } from './release-diff-summary.ts';

export type PackageReleaseDiffState = 'changed' | 'first-publish' | 'unchanged';

export type PackageReleaseDiff = {
    readonly name: string;
    readonly state: PackageReleaseDiffState;
    readonly versionTransition: string;
    readonly previousVersionLabel: string;
    readonly files: FileSetDiff;
    readonly diagnostics: PackageReport;
};

export type PackageReleaseDiffStateView = Pick<PackageReleaseDiff, 'files' | 'state'>;

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
    return Object.values(report.packages).reduce((count, pkg) => {
        return pkg.failure === undefined ? count : count + 1;
    }, 0);
}

function isPreviewableReleaseDiff(result: ReleaseDiffAllResult): boolean {
    return result.isOk || (result.error.type === 'partial' && result.error.succeeded.length > 0);
}

function getReleaseDiffResultType(result: ReleaseDiffAllResult): PreviewResultType {
    if (result.isOk) {
        return 'success';
    }
    return result.error.type;
}

function getReleaseDiffIssues(result: ReleaseDiffAllResult): readonly string[] {
    if (result.isOk) {
        return [];
    }
    if (result.error.type === 'partial') {
        return result.error.failures.map((failure) => {
            return failure.message;
        });
    }
    return result.error.issues;
}

export function buildReleaseDiffDocument(params: ReleaseDiffDocumentParams): ReleaseDiffDocument {
    const { report, result, packages } = params;
    const failedPackages = countFailedPackages(report);
    return {
        title: 'Packtory release diff',
        modeLabel: 'vs registry latest',
        previewable: isPreviewableReleaseDiff(result),
        resultType: getReleaseDiffResultType(result),
        summary: summarizeReleaseDiff(packages, failedPackages),
        packages,
        issues: getReleaseDiffIssues(result),
        report
    };
}
