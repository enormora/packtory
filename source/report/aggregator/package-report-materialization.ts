import { isDefined, pickBy } from 'remeda';
import { mergeArtifactEntry } from './artifact-entry-merger.ts';
import type { PackageReport } from './report-types.ts';

function buildOutputs(entry: PackageReport): PackageReport['outputs'] {
    if (entry.outputs === undefined) {
        return undefined;
    }
    const rewrittenSourcePaths = new Set(
        entry.decisions.linker?.rewrites.map(function (rewrite) {
            return rewrite.file;
        })
    );
    const transformedSourcePaths = new Set(
        entry
            .decisions
            .deadCodeElimination
            ?.files
            .filter(function (file) {
                return file.decision === 'transformed';
            })
            .map(function (file) {
                return file.path;
            })
    );
    return {
        tarball: {
            totalBytes: entry.outputs.tarball.totalBytes,
            entries: entry.outputs.tarball.entries.map(function (artifact) {
                return mergeArtifactEntry(artifact, rewrittenSourcePaths, transformedSourcePaths);
            })
        }
    };
}

export function toPackageReport(entry: PackageReport): PackageReport {
    return pickBy({
        workspaceSnapshot: entry.workspaceSnapshot,
        packageSnapshot: entry.packageSnapshot,
        decisions: entry.decisions,
        timings: entry.timings,
        inputs: entry.inputs,
        outputs: buildOutputs(entry),
        publication: entry.publication,
        eliminatedSourceFiles: entry.eliminatedSourceFiles,
        failure: entry.failure
    }, isDefined);
}
