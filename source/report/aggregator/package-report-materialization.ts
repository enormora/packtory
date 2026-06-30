import { isDefined, pickBy } from 'remeda';
import type { ArtifactEntry } from '../../progress/progress-broadcaster.ts';
import { mergeArtifactEntry } from './artifact-entry-merger.ts';
import type { MutablePackageReport, PackageReport } from './report-types.ts';

type Required<T> = NonNullable<T>;
type Inputs = Required<PackageReport['inputs']>;

function materializeInputs(entry: MutablePackageReport): Inputs {
    const inputs: Inputs = {
        roots: entry.roots ?? {},
        siblingVersions: entry.siblingVersions ?? {},
        sourceFileCount: entry.sourceFileCount ?? 0
    };

    if (entry.effectiveConfig === undefined) {
        return inputs;
    }

    return { ...inputs, effectiveConfig: entry.effectiveConfig };
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
    const mergedEntries: ArtifactEntry[] = Array.from(
        entries,
        function (entry) {
            return mergeArtifactEntry(entry, rewrittenSourcePaths, transformedSourcePaths);
        }
    );

    return mergedEntries;
}

function collectRewrittenSourcePaths(entry: MutablePackageReport): ReadonlySet<string> {
    const rewrittenSourcePaths = new Set<string>();
    const rewrites = entry.decisions.linker?.rewrites;

    if (rewrites === undefined) {
        return rewrittenSourcePaths;
    }

    for (const rewrite of rewrites) {
        rewrittenSourcePaths.add(rewrite.file);
    }

    return rewrittenSourcePaths;
}

function collectTransformedSourcePaths(entry: MutablePackageReport): ReadonlySet<string> {
    const transformedSourcePaths = new Set<string>();
    const files = entry.decisions.deadCodeElimination?.files;

    if (files === undefined) {
        return transformedSourcePaths;
    }

    for (const file of files) {
        if (file.decision === 'transformed') {
            transformedSourcePaths.add(file.path);
        }
    }

    return transformedSourcePaths;
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
    return pickBy(
        {
            decisions: entry.decisions,
            timings: entry.timings,
            inputs,
            outputs,
            publication: entry.publication,
            eliminatedSourceFiles: entry.eliminatedSourceFiles,
            failure: entry.failure
        },
        isDefined
    );
}
