import type { ArtifactEntry } from '../../progress/progress-broadcaster.ts';
import { mergeArtifactEntry } from './artifact-entry-merger.ts';
import type { MutablePackageReport, PackageReport } from './report-types.ts';

type Required<T> = NonNullable<T>;
type Inputs = Required<PackageReport['inputs']>;

function materializeInputs(entry: MutablePackageReport): Inputs {
    const base: Inputs = {
        roots: entry.roots ?? {},
        siblingVersions: entry.siblingVersions ?? {},
        sourceFileCount: entry.sourceFileCount ?? 0
    };
    if (entry.effectiveConfig === undefined) {
        return base;
    }
    return { ...base, effectiveConfig: entry.effectiveConfig };
}

function buildInputs(entry: MutablePackageReport): Inputs | undefined {
    if (entry.roots === undefined && entry.effectiveConfig === undefined) {
        return undefined;
    }
    return materializeInputs(entry);
}

function mergeArtifactEntries(
    entries: readonly ArtifactEntry[],
    rewrittenSourcePaths: ReadonlySet<string>,
    transformedSourcePaths: ReadonlySet<string>
): readonly ArtifactEntry[] {
    return entries.map((entry) => {
        return mergeArtifactEntry(entry, rewrittenSourcePaths, transformedSourcePaths);
    });
}

function collectRewrittenSourcePaths(entry: MutablePackageReport): ReadonlySet<string> {
    return new Set(
        entry.decisions.linker?.rewrites.map((rewrite) => {
            return rewrite.file;
        })
    );
}

function collectTransformedSourcePaths(entry: MutablePackageReport): ReadonlySet<string> {
    return new Set(
        entry.decisions.deadCodeElimination?.files
            .filter((file) => {
                return file.decision === 'transformed';
            })
            .map((file) => {
                return file.path;
            })
    );
}

function buildOutputs(entry: MutablePackageReport): PackageReport['outputs'] | undefined {
    if (entry.outputs === undefined) {
        return undefined;
    }
    const rewrittenSourcePaths = collectRewrittenSourcePaths(entry);
    const transformedSourcePaths = collectTransformedSourcePaths(entry);
    return {
        tarball: {
            totalBytes: entry.outputs.tarball.totalBytes,
            entries: mergeArtifactEntries(entry.outputs.tarball.entries, rewrittenSourcePaths, transformedSourcePaths)
        }
    };
}

export function toPackageReport(entry: MutablePackageReport): PackageReport {
    const inputs = buildInputs(entry);
    const outputs = buildOutputs(entry);
    return {
        decisions: entry.decisions,
        timings: entry.timings,
        ...(inputs === undefined ? {} : { inputs }),
        ...(outputs === undefined ? {} : { outputs }),
        ...(entry.eliminatedSourceFiles === undefined ? {} : { eliminatedSourceFiles: entry.eliminatedSourceFiles }),
        ...(entry.failure === undefined ? {} : { failure: entry.failure })
    };
}
