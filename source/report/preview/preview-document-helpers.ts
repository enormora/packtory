import type { EliminatedSourceFile } from '../../progress/progress-broadcaster.ts';
import type { PackageReport } from '../aggregator/report-types.ts';
import type { PreviewArtifact } from './artifact-tree-builder.ts';

export function buildVersionTransition(packageReport: PackageReport): string | undefined {
    const { version } = packageReport.decisions;
    if (version === undefined) {
        return undefined;
    }
    if (version.previousVersion === undefined) {
        return version.chosenVersion;
    }
    return `${version.previousVersion} -> ${version.chosenVersion}`;
}

export function hasMeaningfulChanges(
    artifacts: readonly PreviewArtifact[],
    eliminatedSourceFiles: readonly EliminatedSourceFile[]
): boolean {
    if (eliminatedSourceFiles.length > 0) {
        return true;
    }
    return artifacts.some((artifact) => {
        return artifact.status === 'changed';
    });
}
