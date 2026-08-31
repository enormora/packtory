import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { AnalyzedBundleResource } from './analyzed-bundle.ts';
import type { AnalyzedResourceOutput } from './code-file-analyzer.ts';
import { buildTextTransformMap, toSourceMapTransform } from './transform/atom-translator.ts';
import { buildMapPathTransformIndex, recomposePairedSourceMaps } from './source-map-recomposition.ts';

type TransformRecord = AnalyzedResourceOutput['transforms'][number];

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
    textTransform: buildTextTransformMap('export const removed = 1;\n', '')
};

suite('source-map-recomposition', function () {
    test('buildMapPathTransformIndex maps each transform to the matching .map file path', function () {
        const index = buildMapPathTransformIndex([ resourceOutput('a.js', [ transformRecord ]) ]);

        assert.strictEqual(index.get('a.js.map')?.length, 1);
    });

    test('buildMapPathTransformIndex omits entries for resources without transforms', function () {
        const index = buildMapPathTransformIndex([ resourceOutput('a.js', []) ]);

        assert.strictEqual(index.size, 0);
    });

    test('recomposePairedSourceMaps leaves unrelated resources unchanged when no transform matches', function () {
        const resource = mapResource('a.js.map', 'original-map');

        assert.deepStrictEqual(recomposePairedSourceMaps([ resource ], new Map()), [ resource ]);
    });

    test('recomposePairedSourceMaps replaces the content for a resource whose map path has a transform', function () {
        const resource = mapResource(
            'a.js.map',
            JSON.stringify({ version: 3, file: 'a.js', sources: [ '/src/x.ts' ], sourcesContent: [], mappings: 'AAAA' })
        );
        const index = buildMapPathTransformIndex([ resourceOutput('a.js', [ transformRecord ]) ]);

        const recomposed = recomposePairedSourceMaps([ resource ], index);

        assert.strictEqual(recomposed.length, 1);
        assert.notStrictEqual(recomposed[0]?.fileDescription.content, resource.fileDescription.content);
    });

    test('recomposePairedSourceMaps applies declaration map transforms', function () {
        const resource = mapResource(
            'index.d.ts.map',
            JSON.stringify({
                version: 3,
                file: 'index.d.ts',
                sources: [ '/src/index.ts' ],
                sourcesContent: [],
                mappings: 'AAAA'
            })
        );
        const linkerTransform = toSourceMapTransform(buildTextTransformMap(
            'import("./dep.js").Dep',
            'import("pkg").Dep'
        ));
        const index = buildMapPathTransformIndex([], new Map([ [ 'index.d.ts', [ linkerTransform ] ] ]));

        const recomposed = recomposePairedSourceMaps([ resource ], index);

        assert.notStrictEqual(recomposed[0]?.fileDescription.content, resource.fileDescription.content);
    });

    test('buildMapPathTransformIndex applies linker transforms before dead code elimination transforms without full code text', function () {
        const linkerTransform = toSourceMapTransform(buildTextTransformMap(
            'import "./dep.js";\nexport const live = 1;\n',
            'import "pkg";\nexport const live = 1;\n'
        ));
        const dceTransform: TransformRecord = {
            textTransform: buildTextTransformMap(
                'import "pkg";\nconst dead = 1;\nexport const live = 1;\n',
                'import "pkg";\nexport const live = 1;\n'
            )
        };

        const index = buildMapPathTransformIndex(
            [ resourceOutput('a.js', [ dceTransform ]) ],
            new Map([ [ 'a.js', [ linkerTransform ] ] ])
        );
        const transforms = index.get('a.js.map') ?? [];
        const firstTransform = transforms[0] as Record<string, unknown>;

        assert.strictEqual(transforms.length, 2);
        assert.strictEqual(transforms[0], linkerTransform);
        assert.strictEqual(Object.hasOwn(firstTransform, 'originalCode'), false);
        assert.strictEqual(Object.hasOwn(firstTransform, 'transformedCode'), false);
    });
});
