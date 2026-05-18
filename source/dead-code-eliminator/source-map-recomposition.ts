import type { AnalyzedBundleResource } from './analyzed-bundle.ts';
import type { AnalyzedResourceOutput, TransformRecord } from './code-file-analyzer.ts';
import { recomposeSourceMap } from './transform/source-map-composer.ts';

export function buildMapPathTransformIndex(
    outputs: readonly AnalyzedResourceOutput[]
): ReadonlyMap<string, TransformRecord> {
    return new Map<string, TransformRecord>(
        outputs.flatMap((output) => {
            return output.transforms.map((transform) => {
                return [`${output.resource.fileDescription.targetFilePath}.map`, transform] as const;
            });
        })
    );
}

export function recomposePairedSourceMaps(
    contents: readonly AnalyzedBundleResource[],
    transformsByMapPath: ReadonlyMap<string, TransformRecord>
): readonly AnalyzedBundleResource[] {
    return contents.map((resource) => {
        const transform = transformsByMapPath.get(resource.fileDescription.targetFilePath);
        if (transform === undefined) {
            return resource;
        }
        const recomposed = recomposeSourceMap({
            originalMap: resource.fileDescription.content,
            originalCode: transform.originalCode,
            transformedCode: transform.transformedCode,
            atoms: transform.atoms
        });
        return {
            ...resource,
            fileDescription: { ...resource.fileDescription, content: recomposed }
        };
    });
}
