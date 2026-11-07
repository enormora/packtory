import assert from 'node:assert';
import {
    decodedMappings,
    encodedMap,
    originalPositionFor,
    presortedDecodedMap,
    TraceMap
} from '@jridgewell/trace-mapping';
import { suite, test } from 'mocha';
import { applySourceTextEdits, toSourceMapTransform } from './text-edits.ts';
import { recomposeSourceMap } from './source-map.ts';

suite('source-map indices', function () {
    test('drops unmapped segments while retaining mapped segments through an edit', function () {
        const code = 'const live = 42;\n';
        const input = JSON.stringify(encodedMap(presortedDecodedMap({
            version: 3,
            sourceRoot: '/authored',
            sources: [ 'index.ts' ],
            names: [],
            mappings: [ [ [ 0 ], [ 6, 0, 0, 6 ] ] ]
        })));
        const transform = toSourceMapTransform(applySourceTextEdits(code, [
            { start: 0, end: 0, content: ' ' }
        ]));

        const result = new TraceMap(recomposeSourceMap(input, [ transform ]));

        assert.deepStrictEqual(decodedMappings(result), [ [ [ 7, 0, 0, 6 ] ] ]);
        assert.deepStrictEqual(originalPositionFor(result, { line: 1, column: 1 }), {
            source: null,
            line: null,
            column: null,
            name: null
        });
    });

    for (const sourceRoot of [ '', 'authored', '../authored', '/authored', 'https://example.com/authored/' ]) {
        test(`preserves source indices and metadata with sourceRoot ${JSON.stringify(sourceRoot)}`, function () {
            const code = 'const dead = 1;\nexport const live = 42;\n';
            const input = JSON.stringify(encodedMap(presortedDecodedMap({
                version: 3,
                file: 'index.js',
                sourceRoot,
                sources: [ 'index.ts', 'other.ts' ],
                sourcesContent: [ code, 'export const other = 42;\n' ],
                names: [ 'live' ],
                mappings: [ [ [ 0, 0, 0, 0 ] ], [ [ 0, 0, 1, 0 ], [ 13, 1, 2, 7, 0 ] ] ]
            })));
            const transform = toSourceMapTransform(applySourceTextEdits(code, [
                { start: 0, end: code.indexOf('export'), content: '' }
            ]));

            const result = new TraceMap(recomposeSourceMap(input, [ transform ]));
            const original = new TraceMap(input);

            assert.deepStrictEqual(decodedMappings(result), [ [ [ 0, 0, 1, 0 ], [ 13, 1, 2, 7, 0 ] ] ]);
            assert.partialDeepStrictEqual(result, {
                file: 'index.js',
                sourceRoot,
                sources: original.sources,
                sourcesContent: original.sourcesContent,
                names: [ 'live' ]
            });
            assert.deepStrictEqual(originalPositionFor(result, { line: 1, column: 0 }), {
                source: original.resolvedSources[0],
                line: 2,
                column: 0,
                name: null
            });
            assert.deepStrictEqual(originalPositionFor(result, { line: 1, column: 13 }), {
                source: original.resolvedSources[1],
                line: 3,
                column: 7,
                name: 'live'
            });
        });
    }

    test('preserves distinct indices when source paths resolve to the same name', function () {
        const code = 'export const live = 42;\n';
        const input = JSON.stringify(encodedMap(presortedDecodedMap({
            version: 3,
            sourceRoot: '/authored',
            sources: [ 'index.ts', './index.ts' ],
            sourcesContent: [ 'first source', 'second source' ],
            names: [ 'live', 'live' ],
            mappings: [ [ [ 0, 0, 1, 0 ], [ 13, 1, 2, 7, 1 ] ] ]
        })));
        const transform = toSourceMapTransform(applySourceTextEdits(code, [
            { start: 0, end: 0, content: '\n' }
        ]));

        const result = new TraceMap(recomposeSourceMap(input, [ transform ]));

        assert.deepStrictEqual(decodedMappings(result), [ [], [ [ 0, 0, 1, 0 ], [ 13, 1, 2, 7, 1 ] ] ]);
        assert.partialDeepStrictEqual(result, {
            sources: [ 'index.ts', './index.ts' ],
            sourcesContent: [ 'first source', 'second source' ],
            names: [ 'live', 'live' ]
        });
    });
});
