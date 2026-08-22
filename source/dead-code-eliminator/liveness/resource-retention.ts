import type { AnalyzedBundle, AnalyzedBundleResource } from '../analyzed-bundle.ts';
import { isDeclarationCodeTargetPath, isRuntimeCodeTargetPath } from './runtime-code.ts';

function rootSourceFilePaths(bundle: Pick<AnalyzedBundle, 'roots'>): ReadonlySet<string> {
    const paths = new Set<string>();
    for (const root of Object.values(bundle.roots)) {
        paths.add(root.js.sourceFilePath);
        if (root.declarationFile !== undefined) {
            paths.add(root.declarationFile.sourceFilePath);
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
        rootPaths.has(resource.fileDescription.sourceFilePath) ||
        resource.isExplicitlyIncluded ||
        !isRuntimeCodeTargetPath(targetFilePath) && !isDeclarationCodeTargetPath(targetFilePath) ||
        resourceHasSurvivingRuntime(resource)
    );
}

function indexResourcesBySourcePath(
    contents: readonly AnalyzedBundleResource[]
): ReadonlyMap<string, AnalyzedBundleResource> {
    return new Map(contents.map(function (resource) {
        return [ resource.fileDescription.sourceFilePath, resource ];
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
            return resource.fileDescription.sourceFilePath;
        });
}

function retainedSourcePaths(
    bundle: Pick<AnalyzedBundle, 'roots'>,
    contents: readonly AnalyzedBundleResource[]
): ReadonlySet<string> {
    const rootPaths = rootSourceFilePaths(bundle);
    const resourcesBySourcePath = indexResourcesBySourcePath(contents);
    const pending = Array.from(retentionSeeds(contents, rootPaths));
    const retained = new Set<string>();

    function retain(sourceFilePath: string): void {
        const resource = resourcesBySourcePath.get(sourceFilePath);
        if (resource !== undefined && !retained.has(sourceFilePath)) {
            retained.add(sourceFilePath);
            pending.push(...resource.directDependencies);
        }
    }

    for (const sourceFilePath of pending) {
        retain(sourceFilePath);
    }
    return retained;
}

function isPrunedResource(resource: AnalyzedBundleResource, retained: ReadonlySet<string>): boolean {
    return !retained.has(resource.fileDescription.sourceFilePath);
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
    bundle: Pick<AnalyzedBundle, 'roots'>,
    contents: readonly AnalyzedBundleResource[],
    transformationsEnabled: boolean
): readonly AnalyzedBundleResource[] {
    if (!transformationsEnabled) {
        return contents;
    }
    const retained = retainedSourcePaths(bundle, contents);
    const prunedMapTargets = prunedMapTargetPaths(contents, retained);
    return contents.filter(function (resource) {
        if (resource.isExplicitlyIncluded) {
            return true;
        }
        return (
            retained.has(resource.fileDescription.sourceFilePath) &&
            !prunedMapTargets.has(resource.fileDescription.targetFilePath)
        );
    });
}
