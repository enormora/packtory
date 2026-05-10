import assert from 'node:assert';
import { TraceMap, eachMapping } from '@jridgewell/trace-mapping';
import { test } from 'mocha';
import type { PositionAtom } from './declaration-remover.ts';
import {
    buildLineIndex,
    findAtomFor,
    lineColumnToOffset,
    offsetToLineColumn,
    recomposeSourceMap,
    translateGeneratedOffset
} from './source-map-composer.ts';

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

test('recomposeSourceMap shifts surviving mappings to their new generated positions', () => {
    const result = recomposeSourceMap({
        originalMap,
        originalCode,
        transformedCode,
        atoms: removeFunctionDeadAtoms
    });
    const mappings = listMappings(result);
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

test('recomposeSourceMap drops mappings with a null source', () => {
    const mapWithUnsourcedSegment = JSON.stringify({
        version: 3,
        file: 'index.ts',
        sources: ['index.ts'],
        sourcesContent: [originalCode],
        names: [],
        // cspell:disable-next-line
        mappings: 'A;AACA,SAAS'
    });
    const result = recomposeSourceMap({
        originalMap: mapWithUnsourcedSegment,
        originalCode,
        transformedCode,
        atoms: removeFunctionDeadAtoms
    });
    const mappings = listMappings(result);
    for (const mapping of mappings) {
        assert.notStrictEqual(mapping.source, null);
    }
});

test('buildLineIndex returns a single entry for an empty string', () => {
    assert.deepStrictEqual(buildLineIndex(''), [{ lineNumber: 1, lineStart: 0 }]);
});

test('buildLineIndex returns one entry per newline-terminated line plus the first line', () => {
    assert.deepStrictEqual(buildLineIndex('a\nb\nc'), [
        { lineNumber: 1, lineStart: 0 },
        { lineNumber: 2, lineStart: 2 },
        { lineNumber: 3, lineStart: 4 }
    ]);
});

test('lineColumnToOffset returns the lineStart plus the column for a known line', () => {
    const index = buildLineIndex('hello\nworld');
    assert.strictEqual(lineColumnToOffset(index, 2, 3), 9);
});

test('lineColumnToOffset returns just the column when the line is past the file', () => {
    const index = buildLineIndex('hello\nworld');
    assert.strictEqual(lineColumnToOffset(index, 99, 4), 4);
});

test('offsetToLineColumn returns line 1 column 0 for offset 0', () => {
    assert.deepStrictEqual(offsetToLineColumn(buildLineIndex('hello\nworld'), 0), { line: 1, column: 0 });
});

test('offsetToLineColumn returns the line containing the offset for a mid-file offset', () => {
    assert.deepStrictEqual(offsetToLineColumn(buildLineIndex('hello\nworld'), 8), { line: 2, column: 2 });
});

test('offsetToLineColumn returns the last line when the offset is past the last newline', () => {
    assert.deepStrictEqual(offsetToLineColumn(buildLineIndex('hello\nworld'), 100), { line: 2, column: 94 });
});

test('findAtomFor returns the atom whose range contains the offset', () => {
    const atoms: readonly PositionAtom[] = [
        { originalStart: 0, originalEnd: 5, newStart: 0 },
        { originalStart: 10, originalEnd: 20, newStart: 5 }
    ];
    assert.deepStrictEqual(findAtomFor(atoms, 12), { originalStart: 10, originalEnd: 20, newStart: 5 });
});

test('findAtomFor treats the originalEnd offset as outside the atom', () => {
    const atoms: readonly PositionAtom[] = [{ originalStart: 0, originalEnd: 5, newStart: 0 }];
    assert.strictEqual(findAtomFor(atoms, 5), undefined);
});

test('findAtomFor treats the originalStart offset as inside the atom', () => {
    const atoms: readonly PositionAtom[] = [{ originalStart: 5, originalEnd: 10, newStart: 0 }];
    assert.deepStrictEqual(findAtomFor(atoms, 5), { originalStart: 5, originalEnd: 10, newStart: 0 });
});

test('findAtomFor returns undefined when no atom covers the offset', () => {
    const atoms: readonly PositionAtom[] = [
        { originalStart: 0, originalEnd: 5, newStart: 0 },
        { originalStart: 10, originalEnd: 20, newStart: 5 }
    ];
    assert.strictEqual(findAtomFor(atoms, 7), undefined);
});

test('translateGeneratedOffset shifts the offset by the atom delta', () => {
    const atoms: readonly PositionAtom[] = [{ originalStart: 10, originalEnd: 20, newStart: 3 }];
    assert.strictEqual(translateGeneratedOffset(15, atoms), 8);
});

test('translateGeneratedOffset returns undefined when the offset is not in any atom', () => {
    const atoms: readonly PositionAtom[] = [{ originalStart: 0, originalEnd: 5, newStart: 0 }];
    assert.strictEqual(translateGeneratedOffset(20, atoms), undefined);
});

test('offsetToLineColumn returns the initial entry for an empty index', () => {
    assert.deepStrictEqual(offsetToLineColumn([], 7), { line: 1, column: 7 });
});

test('recomposeSourceMap preserves originalLine and originalColumn as numbers on translated mappings', () => {
    const result = recomposeSourceMap({
        originalMap,
        originalCode,
        transformedCode,
        atoms: removeFunctionDeadAtoms
    });
    const mappings = listMappings(result);
    assert.ok(mappings.length > 0);
    for (const mapping of mappings) {
        assert.strictEqual(typeof mapping.originalLine, 'number');
        assert.strictEqual(typeof mapping.originalColumn, 'number');
    }
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
    const parsed = JSON.parse(result) as { readonly file?: string | null };
    assert.ok(parsed.file === null || parsed.file === undefined);
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
