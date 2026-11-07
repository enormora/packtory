import assert from 'node:assert';
import {
    decodedMappings,
    encodedMap,
    originalPositionFor,
    presortedDecodedMap,
    TraceMap
} from '@jridgewell/trace-mapping';
import fastCheck from 'fast-check';
import { suite, test } from 'mocha';
import { applySourceTextEdits, toSourceMapTransform } from './text-edits.ts';
import { recomposeSourceMap } from './source-map.ts';

suite('source map semantic equivalence', function () {
    test('preserves source and name indices through successive edits without authored files', function () {
        fastCheck.assert(
            fastCheck.property(
                fastCheck.record({
                    sourceRoot: fastCheck.constantFrom(
                        '',
                        'authored',
                        '../authored',
                        '/authored',
                        'https://example.com/src/'
                    ),
                    padding: fastCheck.integer({ min: 1, max: 8 }),
                    name: fastCheck.stringMatching(/^[a-z]{1,8}$/),
                    originalLine: fastCheck.integer({ min: 0, max: 20 }),
                    originalColumn: fastCheck.integer({ min: 0, max: 40 })
                }),
                function ({ sourceRoot, padding, name, originalLine, originalColumn }) {
                    const code = 'const dead = 1;\nexport const live = 42;\n';
                    const input = JSON.stringify(encodedMap(presortedDecodedMap({
                        version: 3,
                        sourceRoot,
                        sources: [ 'one.ts', 'two.ts' ],
                        sourcesContent: [ 'first authored source', 'second authored source' ],
                        names: [ name ],
                        mappings: [ [ [ 0, 0, 0, 0 ] ], [ [ 0, 1, originalLine, originalColumn, 0 ] ] ]
                    })));
                    const removal = applySourceTextEdits(code, [
                        { start: 0, end: code.indexOf('export'), content: '' }
                    ]);
                    const insertion = applySourceTextEdits(removal.transformedCode, [
                        { start: 0, end: 0, content: ' '.repeat(padding) }
                    ]);
                    const result = new TraceMap(recomposeSourceMap(input, [
                        toSourceMapTransform(removal),
                        toSourceMapTransform(insertion)
                    ]));
                    assert.deepStrictEqual(decodedMappings(result), [ [ [
                        padding,
                        1,
                        originalLine,
                        originalColumn,
                        0
                    ] ] ]);
                    assert.deepStrictEqual(result.sourcesContent, [
                        'first authored source',
                        'second authored source'
                    ]);
                    const original = new TraceMap(input);
                    assert.deepStrictEqual(originalPositionFor(result, { line: 1, column: padding }), {
                        source: original.resolvedSources[1],
                        line: originalLine + 1,
                        column: originalColumn,
                        name
                    });
                }
            ),
            { numRuns: 50, seed: 20_261_107 }
        );
    });
});
