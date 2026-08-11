import type { AnalyzedBundleResource } from './analyzed-bundle.ts';
import type { AnalyzedResourceOutput } from './code-file-analyzer.ts';
import { toSourceMapTransform, type SourceMapTransform } from './transform/atom-translator.ts';
import { recomposeSourceMap } from './transform/source-map-composer.ts';

export function buildMapPathTransformIndex(
    outputs: readonly AnalyzedResourceOutput[],
    sourceMapTransformsByTargetPath: ReadonlyMap<string, readonly SourceMapTransform[]> = new Map()
): ReadonlyMap<string, readonly SourceMapTransform[]> {
    const transformsByMapPath = new Map<string, readonly SourceMapTransform[]>();
    for (const [ targetPath, transforms ] of sourceMapTransformsByTargetPath) {
        transformsByMapPath.set(`${targetPath}.map`, transforms);
    }

    for (const output of outputs) {
        const mapPath = `${output.resource.fileDescription.targetFilePath}.map`;
        for (const transform of output.transforms) {
            const current = transformsByMapPath.get(mapPath) ?? [];
            transformsByMapPath.set(mapPath, [ ...current, toSourceMapTransform(transform.textTransform) ]);
        }
    }

    return transformsByMapPath;
}

export function recomposePairedSourceMaps(
    contents: readonly AnalyzedBundleResource[],
    transformsByMapPath: ReadonlyMap<string, readonly SourceMapTransform[]>
): readonly AnalyzedBundleResource[] {
    return contents.map(function (resource) {
        const sourceMapTransforms = transformsByMapPath.get(resource.fileDescription.targetFilePath);
        if (sourceMapTransforms === undefined) {
            return resource;
        }
        const recomposed = recomposeSourceMap(resource.fileDescription.content, sourceMapTransforms);
        return {
            ...resource,
            fileDescription: { ...resource.fileDescription, content: recomposed }
        };
    });
}
