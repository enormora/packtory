import type { AnalyzedBundle, AnalyzedBundleResource } from '../analyzed-bundle.ts';
import type { DeadCodeEliminationTrace, PruneKind } from '../trace.ts';
import { isDeclarationCodeTargetPath, isRuntimeCodeTargetPath } from './runtime-code.ts';

function rootTargetFilePaths(bundle: Pick<AnalyzedBundle, 'roots'>): ReadonlySet<string> {
    const paths = new Set<string>();
    for (const root of Object.values(bundle.roots)) {
        paths.add(root.js.targetFilePath);
        if (root.declarationFile !== undefined) {
            paths.add(root.declarationFile.targetFilePath);
        }
    }
    return paths;
}

function resourceHasSurvivingRuntime(resource: AnalyzedBundleResource): boolean {
    return resource.analysis.sideEffectStatements.length > 0 || resource.analysis.survivingBindings.size > 0;
}

function shouldSeedResource(resource: AnalyzedBundleResource, rootPaths: ReadonlySet<string>): boolean {
    const { targetFilePath } = resource.fileDescription;
    return (
        rootPaths.has(targetFilePath) ||
        resource.isExplicitlyIncluded ||
        !isRuntimeCodeTargetPath(targetFilePath) && !isDeclarationCodeTargetPath(targetFilePath) ||
        resourceHasSurvivingRuntime(resource)
    );
}

function indexResourcesByTargetPath(
    contents: readonly AnalyzedBundleResource[]
): ReadonlyMap<string, AnalyzedBundleResource> {
    return new Map(contents.map(function (resource) {
        return [ resource.fileDescription.targetFilePath, resource ];
    }));
}

function retentionSeeds(
    contents: readonly AnalyzedBundleResource[],
    rootPaths: ReadonlySet<string>
): readonly string[] {
    return contents
        .filter(function (resource) {
            return shouldSeedResource(resource, rootPaths);
        })
        .map(function (resource) {
            return resource.fileDescription.targetFilePath;
        });
}

function retainedTargetPaths(
    bundle: Pick<AnalyzedBundle, 'roots'>,
    contents: readonly AnalyzedBundleResource[]
): ReadonlySet<string> {
    const rootPaths = rootTargetFilePaths(bundle);
    const resourcesByTargetPath = indexResourcesByTargetPath(contents);
    const pending = Array.from(retentionSeeds(contents, rootPaths));
    const retained = new Set<string>();

    function retain(targetFilePath: string): void {
        const resource = resourcesByTargetPath.get(targetFilePath);
        if (resource !== undefined && !retained.has(targetFilePath)) {
            retained.add(targetFilePath);
            pending.push(...resource.directDependencies);
        }
    }

    for (const targetFilePath of pending) {
        retain(targetFilePath);
    }
    return retained;
}

function isPrunedResource(resource: AnalyzedBundleResource, retained: ReadonlySet<string>): boolean {
    return !retained.has(resource.fileDescription.targetFilePath);
}

function prunedMapTargetPaths(
    contents: readonly AnalyzedBundleResource[],
    retained: ReadonlySet<string>
): ReadonlySet<string> {
    return new Set(
        contents
            .filter(function (resource) {
                return isPrunedResource(resource, retained);
            })
            .map(function (resource) {
                return `${resource.fileDescription.targetFilePath}.map`;
            })
    );
}

export function pruneContents(
    bundle: Pick<AnalyzedBundle, 'name' | 'roots'>,
    contents: readonly AnalyzedBundleResource[],
    transformationsEnabled: boolean,
    trace: DeadCodeEliminationTrace
): readonly AnalyzedBundleResource[] {
    if (!transformationsEnabled) {
        return contents;
    }
    const retained = retainedTargetPaths(bundle, contents);
    const prunedMapTargets = prunedMapTargetPaths(contents, retained);
    return contents.filter(function (resource) {
        if (resource.isExplicitlyIncluded) {
            return true;
        }
        const keep = retained.has(resource.fileDescription.targetFilePath) &&
            !prunedMapTargets.has(resource.fileDescription.targetFilePath);
        if (!keep && trace !== undefined) {
            const pruneKind: PruneKind = retained.has(resource.fileDescription.targetFilePath)
                ? 'paired-map-of-pruned-resource'
                : 'unreachable-resource';
            trace.collector.record({
                type: 'file-pruned',
                bundleName: bundle.name,
                inputFilePath: resource.fileDescription.inputFilePath,
                targetFilePath: resource.fileDescription.targetFilePath,
                pruneKind
            });
        }
        return keep;
    });
}
