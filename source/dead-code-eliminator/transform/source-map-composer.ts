import { addMapping, GenMapping, toEncodedMap } from '@jridgewell/gen-mapping';
import { eachMapping, TraceMap, type EachMapping } from '@jridgewell/trace-mapping';
import type { PositionAtom } from './declaration-remover.ts';

export type RecomposeInput = {
    readonly originalMap: string;
    readonly originalCode: string;
    readonly transformedCode: string;
    readonly atoms: readonly PositionAtom[];
};

export type LineColumn = { readonly line: number; readonly column: number };

type LineIndexEntry = {
    readonly lineNumber: number;
    readonly lineStart: number;
};

export type LineIndex = readonly LineIndexEntry[];

export function buildLineIndex(text: string): LineIndex {
    const entries: LineIndexEntry[] = [{ lineNumber: 1, lineStart: 0 }];
    let index = text.indexOf('\n');
    while (index !== -1) {
        entries.push({ lineNumber: entries.length + 1, lineStart: index + 1 });
        index = text.indexOf('\n', index + 1);
    }
    return entries;
}

export function lineColumnToOffset(lineIndex: LineIndex, oneBasedLine: number, column: number): number {
    const entry = lineIndex.find((candidate) => {
        return candidate.lineNumber === oneBasedLine;
    });
    if (entry === undefined) {
        return column;
    }
    return entry.lineStart + column;
}

export function offsetToLineColumn(lineIndex: LineIndex, offset: number): LineColumn {
    let current: LineIndexEntry = { lineNumber: 1, lineStart: 0 };
    for (const entry of lineIndex) {
        if (entry.lineStart > offset) {
            break;
        }
        current = entry;
    }
    return { line: current.lineNumber, column: offset - current.lineStart };
}

export function findAtomFor(atoms: readonly PositionAtom[], offset: number): PositionAtom | undefined {
    return atoms.find((atom) => {
        return offset >= atom.originalStart && offset < atom.originalEnd;
    });
}

export function translateGeneratedOffset(offset: number, atoms: readonly PositionAtom[]): number | undefined {
    const atom = findAtomFor(atoms, offset);
    if (atom === undefined) {
        return undefined;
    }
    return atom.newStart + (offset - atom.originalStart);
}

function omitNull<T>(value: T | null | undefined): T | undefined {
    if (value === null) {
        return undefined;
    }
    return value;
}

type TranslatedMapping = {
    readonly generated: LineColumn;
    readonly source: string;
    readonly original: LineColumn;
};

function translateMapping(
    mapping: EachMapping,
    originalIndex: LineIndex,
    transformedIndex: LineIndex,
    atoms: readonly PositionAtom[]
): TranslatedMapping | undefined {
    if (mapping.source === null) {
        return undefined;
    }
    const oldOffset = lineColumnToOffset(originalIndex, mapping.generatedLine, mapping.generatedColumn);
    const newOffset = translateGeneratedOffset(oldOffset, atoms);
    if (newOffset === undefined) {
        return undefined;
    }
    return {
        generated: offsetToLineColumn(transformedIndex, newOffset),
        source: mapping.source,
        original: { line: mapping.originalLine, column: mapping.originalColumn }
    };
}

function appendMapping(newMap: GenMapping, translated: TranslatedMapping): void {
    addMapping(newMap, {
        generated: translated.generated,
        source: translated.source,
        original: translated.original
    });
}

function tryParseTraceMap(originalMap: string): TraceMap | null {
    try {
        return new TraceMap(originalMap);
    } catch {
        return null;
    }
}

function buildOutputJson(traceMap: TraceMap, encodedMappings: string): string {
    return JSON.stringify({
        version: 3,
        file: omitNull(traceMap.file),
        sourceRoot: traceMap.sourceRoot,
        sources: traceMap.sources,
        sourcesContent: traceMap.sourcesContent,
        names: traceMap.names,
        mappings: encodedMappings
    });
}

export function recomposeSourceMap(input: RecomposeInput): string {
    const traceMap = tryParseTraceMap(input.originalMap);
    if (traceMap === null) {
        return input.originalMap;
    }
    const originalIndex = buildLineIndex(input.originalCode);
    const transformedIndex = buildLineIndex(input.transformedCode);
    const mappingsBuilder = new GenMapping();
    eachMapping(traceMap, (mapping) => {
        const translated = translateMapping(mapping, originalIndex, transformedIndex, input.atoms);
        if (translated !== undefined) {
            appendMapping(mappingsBuilder, translated);
        }
    });
    return buildOutputJson(traceMap, toEncodedMap(mappingsBuilder).mappings);
}
