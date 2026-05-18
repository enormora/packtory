import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { AnalyzedBundleResource } from './analyzed-bundle.ts';
import type { AnalyzedResourceOutput, TransformRecord } from './code-file-analyzer.ts';
import { buildMapPathTransformIndex, recomposePairedSourceMaps } from './source-map-recomposition.ts';

function resourceOutput(targetFilePath: string, transforms: readonly TransformRecord[]): AnalyzedResourceOutput {
    return {
        resource: { fileDescription: { targetFilePath } } as unknown as AnalyzedResourceOutput['resource'],
        transforms
    };
}

function mapResource(targetFilePath: string, content: string): AnalyzedBundleResource {
    return {
        fileDescription: { sourceFilePath: '/src/x.map', targetFilePath, content, isExecutable: false }
    } as unknown as AnalyzedBundleResource;
}

const transformRecord: TransformRecord = {
    originalCode: 'export const removed = 1;\n',
    transformedCode: '',
    atoms: []
};

suite('source-map-recomposition', function () {
    test('buildMapPathTransformIndex maps each transform to the matching .map file path', function () {
        const index = buildMapPathTransformIndex([resourceOutput('a.js', [transformRecord])]);

        assert.strictEqual(index.get('a.js.map'), transformRecord);
    });

    test('buildMapPathTransformIndex omits entries for resources without transforms', function () {
        const index = buildMapPathTransformIndex([resourceOutput('a.js', [])]);

        assert.strictEqual(index.size, 0);
    });

    test('recomposePairedSourceMaps leaves unrelated resources unchanged when no transform matches', function () {
        const resource = mapResource('a.js.map', 'original-map');

        assert.deepStrictEqual(recomposePairedSourceMaps([resource], new Map()), [resource]);
    });

    test('recomposePairedSourceMaps replaces the content for a resource whose map path has a transform', function () {
        const resource = mapResource(
            'a.js.map',
            JSON.stringify({ version: 3, file: 'a.js', sources: ['/src/x.ts'], sourcesContent: [], mappings: '' })
        );
        const index = new Map([['a.js.map', transformRecord]]);

        const recomposed = recomposePairedSourceMaps([resource], index);

        assert.strictEqual(recomposed.length, 1);
        assert.notStrictEqual(recomposed[0]?.fileDescription.content, resource.fileDescription.content);
    });
});
