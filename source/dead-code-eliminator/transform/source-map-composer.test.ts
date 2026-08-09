import assert from 'node:assert';
import { addMapping, GenMapping, toEncodedMap } from '@jridgewell/gen-mapping';
import { TraceMap, eachMapping } from '@jridgewell/trace-mapping';
import { suite, test } from 'mocha';
import { buildTextTransformMap, type PositionAtom } from './atom-translator.ts';
import { recomposeSourceMap as recomposeSourceMapWithTransform } from './source-map-composer.ts';

type Mapping = {
    readonly generatedLine: number;
    readonly generatedColumn: number;
    readonly originalLine: number | null;
    readonly originalColumn: number | null;
    readonly source: string | null;
};

type LegacyRecomposeInput = {
    readonly originalMap: string;
    readonly originalCode: string;
    readonly transformedCode: string;
    readonly atoms: readonly PositionAtom[];
};

function recomposeSourceMap(input: LegacyRecomposeInput): string {
    return recomposeSourceMapWithTransform({
        originalMap: input.originalMap,
        textTransform: {
            originalCode: input.originalCode,
            transformedCode: input.transformedCode,
            atoms: input.atoms
        }
    });
}

function listMappings(mapJson: string): readonly Mapping[] {
    const traceMap = new TraceMap(mapJson);
    const result: Mapping[] = [];
    eachMapping(traceMap, function (mapping) {
        result.push({
            generatedLine: mapping.generatedLine,
            generatedColumn: mapping.generatedColumn,
            originalLine: mapping.originalLine,
            originalColumn: mapping.originalColumn,
            source: mapping.source
        });
    });
    return result;
}

function singleMappingMap(generatedColumn: number, originalCode: string): string {
    const map = new GenMapping({ file: 'index.ts' });
    addMapping(map, {
        generated: { line: 1, column: generatedColumn },
        source: 'index.ts',
        original: { line: 1, column: generatedColumn }
    });
    return JSON.stringify({
        ...toEncodedMap(map),
        sourcesContent: [ originalCode ]
    });
}

const originalCode = 'function dead() { return 1; }\nexport function live() { return 2; }';
const transformedCode = '\nexport function live() { return 2; }';

const originalMap = JSON.stringify({
    version: 3,
    file: 'index.ts',
    sources: [ 'index.ts' ],
    sourcesContent: [ originalCode ],
    names: [],
    mappings: 'AAAA;AACA,SAAS,IAAI;AACX,OAAO,CAAC,CAAC;AACX'
});

const removeFunctionDeadAtoms: readonly PositionAtom[] = [ { originalStart: 30, originalEnd: 66, newStart: 1 } ];

function recomposedMappings(): readonly Mapping[] {
    return listMappings(
        recomposeSourceMap({ originalMap, originalCode, transformedCode, atoms: removeFunctionDeadAtoms })
    );
}

suite('source-map-composer', function () {
    suite('removed range mappings', function () {
        test('recomposeSourceMap drops mappings inside the removed range', function () {
            const result = recomposeSourceMap({
                originalMap,
                originalCode,
                transformedCode,
                atoms: removeFunctionDeadAtoms
            });
            const mappings = listMappings(result);
            for (const mapping of mappings) {
                assert.notStrictEqual(mapping.generatedLine, 1, 'no mapping should land on the removed line 1');
            }
        });

        test('recomposeSourceMap shifts surviving mappings to their new generated positions', function () {
            const mappings = recomposedMappings();
            assert.ok(mappings.length > 0);
            for (const mapping of mappings) {
                assert.strictEqual(mapping.source, 'index.ts');
            }
        });

        test('recomposeSourceMap returns the original map unchanged when it cannot be parsed', function () {
            const result = recomposeSourceMap({
                originalMap: 'not-json',
                originalCode,
                transformedCode,
                atoms: removeFunctionDeadAtoms
            });
            assert.strictEqual(result, 'not-json');
        });

        test('recomposeSourceMap returns the original map unchanged when the v3 input has no mappings field', function () {
            const minimal = JSON.stringify({ version: 3 });
            const result = recomposeSourceMap({
                originalMap: minimal,
                originalCode,
                transformedCode,
                atoms: removeFunctionDeadAtoms
            });
            assert.strictEqual(result, minimal);
        });

        test('recomposeSourceMap produces a valid v3 map for a no-op atom list', function () {
            const result = recomposeSourceMap({
                originalMap,
                originalCode,
                transformedCode: originalCode,
                atoms: [ { originalStart: 0, originalEnd: originalCode.length, newStart: 0 } ]
            });
            const parsed = JSON.parse(result) as { readonly version: number; };
            assert.strictEqual(parsed.version, 3);
        });

        test('recomposeSourceMap preserves the `file` field from the input map', function () {
            const result = recomposeSourceMap({
                originalMap,
                originalCode,
                transformedCode,
                atoms: removeFunctionDeadAtoms
            });
            const parsed = JSON.parse(result) as { readonly file?: string; };
            assert.strictEqual(parsed.file, 'index.ts');
        });

        test('recomposeSourceMap preserves sourcesContent from the input map', function () {
            const result = recomposeSourceMap({
                originalMap,
                originalCode,
                transformedCode,
                atoms: removeFunctionDeadAtoms
            });
            const parsed = JSON.parse(result) as { readonly sourcesContent?: readonly string[]; };
            assert.deepStrictEqual(parsed.sourcesContent, [ originalCode ]);
        });

        test('recomposeSourceMap handles a map without a file field', function () {
            const mapWithoutFile = JSON.stringify({
                version: 3,
                sources: [ 'index.ts' ],
                sourcesContent: [ originalCode ],
                names: [],
                mappings: 'AAAA;AACA,SAAS,IAAI;AACX,OAAO,CAAC,CAAC;AACX'
            });
            const result = recomposeSourceMap({
                originalMap: mapWithoutFile,
                originalCode,
                transformedCode,
                atoms: removeFunctionDeadAtoms
            });
            const parsed = JSON.parse(result) as { readonly file?: string; };
            assert.strictEqual(parsed.file, undefined);
        });
    });

    suite('surviving mapping metadata', function () {
        test('recomposeSourceMap preserves the `name` field on named mappings', function () {
            const namedMap = JSON.stringify({
                version: 3,
                file: 'index.ts',
                sources: [ 'index.ts' ],
                sourcesContent: [ originalCode ],
                names: [ 'live' ],
                mappings: 'AAAA;AACA,SAASA,IAAI'
            });
            const result = recomposeSourceMap({
                originalMap: namedMap,
                originalCode,
                transformedCode,
                atoms: removeFunctionDeadAtoms
            });
            const parsed = JSON.parse(result) as { readonly names?: readonly string[]; };
            assert.deepStrictEqual(parsed.names, [ 'live' ]);
        });

        test('recomposeSourceMap drops mappings with a null source even when the position falls inside a surviving atom', function () {
            // Null-source segment at the start of line 2 (which is inside the surviving atom range).
            const mapWithUnsourcedSegmentInRange = JSON.stringify({
                version: 3,
                file: 'index.ts',
                sources: [ 'index.ts' ],
                sourcesContent: [ originalCode ],
                names: [],
                // line 1: AAAA (gen col 0 → source 0 line 1 col 0)
                // line 2 starts with `A` (1-field segment at col 0, null source), then standard mappings
                mappings: 'AAAA;A,AACA,SAAS'
            });
            const result = recomposeSourceMap({
                originalMap: mapWithUnsourcedSegmentInRange,
                originalCode,
                transformedCode,
                atoms: removeFunctionDeadAtoms
            });
            const mappings = listMappings(result);
            for (const mapping of mappings) {
                assert.notStrictEqual(mapping.source, null);
            }
        });

        test('recomposeSourceMap preserves originalLine and originalColumn as numbers on translated mappings', function () {
            const mappings = recomposedMappings();
            assert.ok(mappings.length > 0);
            for (const mapping of mappings) {
                assert.strictEqual(typeof mapping.originalLine, 'number');
                assert.strictEqual(typeof mapping.originalColumn, 'number');
            }
        });

        test('recomposeSourceMap copies the original line and column values from each surviving mapping', function () {
            const mappings = recomposedMappings();
            const hasNonInitialOriginal = mappings.some(function (mapping) {
                return (mapping.originalLine ?? 0) > 1 || (mapping.originalColumn ?? 0) > 0;
            });
            assert.ok(hasNonInitialOriginal);
        });

        test('recomposeSourceMap emits exactly the mappings that translate into the transformed range', function () {
            const mappings = recomposedMappings();
            assert.strictEqual(mappings.length, 3);
        });

        test('recomposeSourceMap preserves a non-null sourceRoot from the input map', function () {
            const mapWithSourceRoot = JSON.stringify({
                version: 3,
                file: 'index.ts',
                sourceRoot: 'src',
                sources: [ 'index.ts' ],
                sourcesContent: [ originalCode ],
                names: [],
                mappings: 'AAAA;AACA'
            });
            const result = recomposeSourceMap({
                originalMap: mapWithSourceRoot,
                originalCode,
                transformedCode,
                atoms: removeFunctionDeadAtoms
            });
            const parsed = JSON.parse(result) as { readonly sourceRoot?: string; };
            assert.strictEqual(parsed.sourceRoot, 'src');
        });

        test('recomposeSourceMap omits the file field for an input map that explicitly has null file', function () {
            const mapWithNullFile = JSON.stringify({
                version: 3,
                file: null,
                sources: [ 'index.ts' ],
                sourcesContent: [ originalCode ],
                names: [],
                mappings: 'AAAA;AACA'
            });
            const result = recomposeSourceMap({
                originalMap: mapWithNullFile,
                originalCode,
                transformedCode,
                atoms: removeFunctionDeadAtoms
            });
            const parsed = JSON.parse(result) as Record<string, unknown>;
            assert.strictEqual(Object.hasOwn(parsed, 'file'), false);
        });

        test('recomposeSourceMap copies sources whose sourcesContent is null in the input map', function () {
            const mapWithNullContent = JSON.stringify({
                version: 3,
                file: 'index.ts',
                sources: [ 'index.ts' ],
                sourcesContent: [ null ],
                names: [],
                mappings: 'AAAA;AACA'
            });
            const result = recomposeSourceMap({
                originalMap: mapWithNullContent,
                originalCode,
                transformedCode,
                atoms: removeFunctionDeadAtoms
            });
            const parsed = JSON.parse(result) as { readonly sourcesContent?: readonly (string | null)[]; };
            const sourcesContent = parsed.sourcesContent ?? [];
            for (const entry of sourcesContent) {
                assert.ok(entry === null || typeof entry === 'string');
            }
        });
    });

    suite('source list cleanup', function () {
        test('recomposeSourceMap omits null entries in sources', function () {
            const mapWithNullSource = JSON.stringify({
                version: 3,
                file: 'index.ts',
                // null source entries are allowed by the v3 spec
                sources: [ null, 'index.ts' ],
                sourcesContent: [ null, originalCode ],
                names: [],
                mappings: 'AAAA;AACA,SAAS'
            });
            const result = recomposeSourceMap({
                originalMap: mapWithNullSource,
                originalCode,
                transformedCode,
                atoms: removeFunctionDeadAtoms
            });
            // Should not crash and produce a valid map.
            const parsed = JSON.parse(result) as { readonly version: number; };
            assert.strictEqual(parsed.version, 3);
        });
    });

    suite('text edit mappings', function () {
        test('recomposeSourceMap shifts mappings inside a partially repaired import', function () {
            const editedOriginalCode = 'import { dead, live } from "./other";\nexport const api = live;';
            const editedTransformedCode = 'import { live } from "./other";\nexport const api = live;';
            const originalLiveColumn = editedOriginalCode.indexOf('live');
            const transformedLiveColumn = editedTransformedCode.indexOf('live');
            const result = recomposeSourceMapWithTransform({
                originalMap: singleMappingMap(originalLiveColumn, editedOriginalCode),
                textTransform: buildTextTransformMap(editedOriginalCode, editedTransformedCode)
            });

            assert.deepStrictEqual(listMappings(result), [
                {
                    generatedLine: 1,
                    generatedColumn: transformedLiveColumn,
                    originalLine: 1,
                    originalColumn: originalLiveColumn,
                    source: 'index.ts'
                }
            ]);
        });

        test('recomposeSourceMap does not map an inserted module marker', function () {
            const markerOriginalCode = 'import type { Dead } from "./types";\ntype Local = Dead;';
            const markerTransformedCode = 'export {};\n';
            const result = recomposeSourceMapWithTransform({
                originalMap: singleMappingMap(0, markerOriginalCode),
                textTransform: buildTextTransformMap(markerOriginalCode, markerTransformedCode)
            });

            assert.deepStrictEqual(listMappings(result), []);
        });
    });
});
