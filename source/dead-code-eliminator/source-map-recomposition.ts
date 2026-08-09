import type { AnalyzedBundleResource } from './analyzed-bundle.ts';
import type { AnalyzedResourceOutput } from './code-file-analyzer.ts';
import { toSourceMapTransform, type SourceMapTransform } from './transform/atom-translator.ts';
import { recomposeSourceMap } from './transform/source-map-composer.ts';

type SourceMapTransformRecord = {
    readonly sourceMapTransforms: readonly SourceMapTransform[];
};

function dceMapPathTransforms(
    outputs: readonly AnalyzedResourceOutput[]
): readonly (readonly [string, SourceMapTransform])[] {
    return (
        outputs.flatMap(function (output) {
            return output.transforms.map(function (transform) {
                return [
                    `${output.resource.fileDescription.targetFilePath}.map`,
                    toSourceMapTransform(transform.textTransform)
                ] as const;
            });
        })
    );
}

export function buildMapPathTransformIndex(
    outputs: readonly AnalyzedResourceOutput[],
    sourceMapTransformsByTargetPath: ReadonlyMap<string, readonly SourceMapTransform[]> = new Map()
): ReadonlyMap<string, SourceMapTransformRecord> {
    const transformsByMapPath = new Map<string, SourceMapTransformRecord>();
    for (const [ targetPath, transforms ] of sourceMapTransformsByTargetPath) {
        transformsByMapPath.set(`${targetPath}.map`, { sourceMapTransforms: transforms });
    }

    for (const [ mapPath, transform ] of dceMapPathTransforms(outputs)) {
        const current = transformsByMapPath.get(mapPath)?.sourceMapTransforms ?? [];
        transformsByMapPath.set(mapPath, { sourceMapTransforms: [ ...current, transform ] });
    }

    return transformsByMapPath;
}

export function recomposePairedSourceMaps(
    contents: readonly AnalyzedBundleResource[],
    transformsByMapPath: ReadonlyMap<string, SourceMapTransformRecord>
): readonly AnalyzedBundleResource[] {
    return contents.map(function (resource) {
        const transform = transformsByMapPath.get(resource.fileDescription.targetFilePath);
        if (transform === undefined) {
            return resource;
        }
        const recomposed = recomposeSourceMap({
            originalMap: resource.fileDescription.content,
            sourceMapTransforms: transform.sourceMapTransforms
        });
        return {
            ...resource,
            fileDescription: { ...resource.fileDescription, content: recomposed }
        };
    });
}
