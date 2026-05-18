import type { PackageReport } from '../aggregator/report-types.ts';

const unpublishedLabel = '(unpublished)';

export function buildReleaseVersionTransition(packageReport: PackageReport): string {
    const { version } = packageReport.decisions;
    if (version === undefined) {
        return unpublishedLabel;
    }
    if (version.previousVersion === undefined) {
        return `${unpublishedLabel} -> ${version.chosenVersion}`;
    }
    return `${version.previousVersion} -> ${version.chosenVersion}`;
}

export function buildReleaseVersionLabel(packageReport: PackageReport): string {
    const { version } = packageReport.decisions;
    if (version?.previousVersion === undefined) {
        return unpublishedLabel;
    }
    return version.previousVersion;
}
