import { addMapping, GenMapping, setSourceContent, toEncodedMap } from '@jridgewell/gen-mapping';
import { eachMapping, sourceContentFor, TraceMap, type EachMapping } from '@jridgewell/trace-mapping';
import type { PositionAtom } from './declaration-remover.ts';

export type RecomposeInput = {
    readonly originalMap: string;
    readonly originalCode: string;
    readonly transformedCode: string;
    readonly atoms: readonly PositionAtom[];
};

export type LineColumn = { readonly line: number; readonly column: number };

export type LineIndexEntry = {
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

function copySingleSourceContent(traceMap: TraceMap, newMap: GenMapping, source: string): void {
    const content = sourceContentFor(traceMap, source);
    if (content !== null) {
        setSourceContent(newMap, source, content);
    }
}

function copySourceContents(traceMap: TraceMap, newMap: GenMapping): void {
    for (const source of traceMap.sources) {
        if (source !== null) {
            copySingleSourceContent(traceMap, newMap, source);
        }
    }
}

function createGenMappingFor(traceMap: TraceMap): GenMapping {
    const { file } = traceMap;
    if (typeof file === 'string') {
        return new GenMapping({ file });
    }
    return new GenMapping();
}

type TranslatedMapping = {
    readonly generated: LineColumn;
    readonly source: string;
    readonly original: LineColumn;
    readonly name: string | null;
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
        original: { line: mapping.originalLine, column: mapping.originalColumn },
        name: mapping.name
    };
}

function appendMapping(newMap: GenMapping, translated: TranslatedMapping): void {
    const base = {
        generated: translated.generated,
        source: translated.source,
        original: translated.original
    };
    if (translated.name === null) {
        addMapping(newMap, base);
    } else {
        addMapping(newMap, { ...base, name: translated.name });
    }
}

function tryParseTraceMap(originalMap: string): TraceMap | undefined {
    try {
        return new TraceMap(originalMap);
    } catch {
        return undefined;
    }
}

export function recomposeSourceMap(input: RecomposeInput): string {
    const traceMap = tryParseTraceMap(input.originalMap);
    if (traceMap === undefined) {
        return input.originalMap;
    }
    const originalIndex = buildLineIndex(input.originalCode);
    const transformedIndex = buildLineIndex(input.transformedCode);
    const newMap = createGenMappingFor(traceMap);
    copySourceContents(traceMap, newMap);
    eachMapping(traceMap, (mapping) => {
        const translated = translateMapping(mapping, originalIndex, transformedIndex, input.atoms);
        if (translated !== undefined) {
            appendMapping(newMap, translated);
        }
    });
    return JSON.stringify(toEncodedMap(newMap));
}
