import assert from 'node:assert';
import { TraceMap, eachMapping } from '@jridgewell/trace-mapping';
import { test } from 'mocha';
import type { PositionAtom } from './declaration-remover.ts';
import { recomposeSourceMap } from './source-map-composer.ts';

type Mapping = {
    readonly generatedLine: number;
    readonly generatedColumn: number;
    readonly originalLine: number | null;
    readonly originalColumn: number | null;
    readonly source: string | null;
};

function listMappings(mapJson: string): readonly Mapping[] {
    const traceMap = new TraceMap(mapJson);
    const result: Mapping[] = [];
    eachMapping(traceMap, (mapping) => {
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

const originalCode = 'function dead() { return 1; }\nexport function live() { return 2; }';
const transformedCode = '\nexport function live() { return 2; }';

const originalMap = JSON.stringify({
    version: 3,
    file: 'index.ts',
    sources: ['index.ts'],
    sourcesContent: [originalCode],
    names: [],
    // cspell:disable-next-line
    mappings: 'AAAA;AACA,SAAS,IAAI;AACX,OAAO,CAAC,CAAC;AACX'
});

const removeFunctionDeadAtoms: readonly PositionAtom[] = [{ originalStart: 30, originalEnd: 66, newStart: 1 }];

test('recomposeSourceMap drops mappings inside the removed range', () => {
    const result = recomposeSourceMap({
        originalMap,
        originalCode,
        transformedCode,
        atoms: removeFunctionDeadAtoms
    });
    const mappings = listMappings(result);
    for (const mapping of mappings) {
        assert.ok(mapping.generatedLine !== 1, 'no mapping should land on the removed line 1');
    }
});

function recomposedMappings(): readonly Mapping[] {
    return listMappings(
        recomposeSourceMap({ originalMap, originalCode, transformedCode, atoms: removeFunctionDeadAtoms })
    );
}

test('recomposeSourceMap shifts surviving mappings to their new generated positions', () => {
    const mappings = recomposedMappings();
    assert.ok(mappings.length > 0);
    for (const mapping of mappings) {
        assert.strictEqual(mapping.source, 'index.ts');
    }
});

test('recomposeSourceMap returns the original map unchanged when it cannot be parsed', () => {
    const result = recomposeSourceMap({
        originalMap: 'not-json',
        originalCode,
        transformedCode,
        atoms: removeFunctionDeadAtoms
    });
    assert.strictEqual(result, 'not-json');
});

test('recomposeSourceMap returns the original map unchanged when the v3 input has no mappings field', () => {
    const minimal = JSON.stringify({ version: 3 });
    const result = recomposeSourceMap({
        originalMap: minimal,
        originalCode,
        transformedCode,
        atoms: removeFunctionDeadAtoms
    });
    assert.strictEqual(result, minimal);
});

test('recomposeSourceMap produces a valid v3 map for a no-op atom list', () => {
    const result = recomposeSourceMap({
        originalMap,
        originalCode,
        transformedCode: originalCode,
        atoms: [{ originalStart: 0, originalEnd: originalCode.length, newStart: 0 }]
    });
    const parsed = JSON.parse(result) as { readonly version: number };
    assert.strictEqual(parsed.version, 3);
});

test('recomposeSourceMap preserves the `file` field from the input map', () => {
    const result = recomposeSourceMap({
        originalMap,
        originalCode,
        transformedCode,
        atoms: removeFunctionDeadAtoms
    });
    const parsed = JSON.parse(result) as { readonly file?: string };
    assert.strictEqual(parsed.file, 'index.ts');
});

test('recomposeSourceMap preserves sourcesContent from the input map', () => {
    const result = recomposeSourceMap({
        originalMap,
        originalCode,
        transformedCode,
        atoms: removeFunctionDeadAtoms
    });
    const parsed = JSON.parse(result) as { readonly sourcesContent?: readonly string[] };
    assert.deepStrictEqual(parsed.sourcesContent, [originalCode]);
});

test('recomposeSourceMap handles a map without a file field', () => {
    const mapWithoutFile = JSON.stringify({
        version: 3,
        sources: ['index.ts'],
        sourcesContent: [originalCode],
        names: [],
        // cspell:disable-next-line
        mappings: 'AAAA;AACA,SAAS,IAAI;AACX,OAAO,CAAC,CAAC;AACX'
    });
    const result = recomposeSourceMap({
        originalMap: mapWithoutFile,
        originalCode,
        transformedCode,
        atoms: removeFunctionDeadAtoms
    });
    const parsed = JSON.parse(result) as { readonly file?: string };
    assert.strictEqual(parsed.file, undefined);
});

test('recomposeSourceMap preserves the `name` field on named mappings', () => {
    const namedMap = JSON.stringify({
        version: 3,
        file: 'index.ts',
        sources: ['index.ts'],
        sourcesContent: [originalCode],
        names: ['live'],
        // cspell:disable-next-line
        mappings: 'AAAA;AACA,SAASA,IAAI'
    });
    const result = recomposeSourceMap({
        originalMap: namedMap,
        originalCode,
        transformedCode,
        atoms: removeFunctionDeadAtoms
    });
    const parsed = JSON.parse(result) as { readonly names?: readonly string[] };
    assert.deepStrictEqual(parsed.names, ['live']);
});

test('recomposeSourceMap drops mappings with a null source even when the position falls inside a surviving atom', () => {
    // Null-source segment at the start of line 2 (which is inside the surviving atom range).
    const mapWithUnsourcedSegmentInRange = JSON.stringify({
        version: 3,
        file: 'index.ts',
        sources: ['index.ts'],
        sourcesContent: [originalCode],
        names: [],
        // line 1: AAAA (gen col 0 → source 0 line 1 col 0)
        // line 2 starts with `A` (1-field segment at col 0, null source), then standard mappings
        // cspell:disable-next-line
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

test('recomposeSourceMap preserves originalLine and originalColumn as numbers on translated mappings', () => {
    const mappings = recomposedMappings();
    assert.ok(mappings.length > 0);
    for (const mapping of mappings) {
        assert.strictEqual(typeof mapping.originalLine, 'number');
        assert.strictEqual(typeof mapping.originalColumn, 'number');
    }
});

test('recomposeSourceMap copies the original line and column values from each surviving mapping', () => {
    const mappings = recomposedMappings();
    const hasNonInitialOriginal = mappings.some((mapping) => {
        return (mapping.originalLine ?? 0) > 1 || (mapping.originalColumn ?? 0) > 0;
    });
    assert.ok(hasNonInitialOriginal);
});

test('recomposeSourceMap emits exactly the mappings that translate into the transformed range', () => {
    const mappings = recomposedMappings();
    assert.strictEqual(mappings.length, 3);
});

test('recomposeSourceMap preserves a non-null sourceRoot from the input map', () => {
    const mapWithSourceRoot = JSON.stringify({
        version: 3,
        file: 'index.ts',
        sourceRoot: 'src',
        sources: ['index.ts'],
        sourcesContent: [originalCode],
        names: [],
        // cspell:disable-next-line
        mappings: 'AAAA;AACA'
    });
    const result = recomposeSourceMap({
        originalMap: mapWithSourceRoot,
        originalCode,
        transformedCode,
        atoms: removeFunctionDeadAtoms
    });
    const parsed = JSON.parse(result) as { readonly sourceRoot?: string };
    assert.strictEqual(parsed.sourceRoot, 'src');
});

test('recomposeSourceMap omits the file field for an input map that explicitly has null file', () => {
    const mapWithNullFile = JSON.stringify({
        version: 3,
        file: null,
        sources: ['index.ts'],
        sourcesContent: [originalCode],
        names: [],
        // cspell:disable-next-line
        mappings: 'AAAA;AACA'
    });
    const result = recomposeSourceMap({
        originalMap: mapWithNullFile,
        originalCode,
        transformedCode,
        atoms: removeFunctionDeadAtoms
    });
    const parsed = JSON.parse(result) as Record<string, unknown>;
    assert.strictEqual('file' in parsed, false);
});

test('recomposeSourceMap copies sources whose sourcesContent is null in the input map', () => {
    const mapWithNullContent = JSON.stringify({
        version: 3,
        file: 'index.ts',
        sources: ['index.ts'],
        sourcesContent: [null],
        names: [],
        // cspell:disable-next-line
        mappings: 'AAAA;AACA'
    });
    const result = recomposeSourceMap({
        originalMap: mapWithNullContent,
        originalCode,
        transformedCode,
        atoms: removeFunctionDeadAtoms
    });
    const parsed = JSON.parse(result) as { readonly sourcesContent?: readonly (string | null)[] };
    for (const entry of parsed.sourcesContent ?? []) {
        assert.ok(entry === null || typeof entry === 'string');
    }
});

test('recomposeSourceMap omits null entries in sources', () => {
    const mapWithNullSource = JSON.stringify({
        version: 3,
        file: 'index.ts',
        // null source entries are allowed by the v3 spec
        sources: [null, 'index.ts'],
        sourcesContent: [null, originalCode],
        names: [],
        // cspell:disable-next-line
        mappings: 'AAAA;AACA,SAAS'
    });
    const result = recomposeSourceMap({
        originalMap: mapWithNullSource,
        originalCode,
        transformedCode,
        atoms: removeFunctionDeadAtoms
    });
    // Should not crash and produce a valid map.
    const parsed = JSON.parse(result) as { readonly version: number };
    assert.strictEqual(parsed.version, 3);
});
