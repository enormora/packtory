import { addMapping, GenMapping, toEncodedMap } from '@jridgewell/gen-mapping';
import { eachMapping, TraceMap, type EachMapping } from '@jridgewell/trace-mapping';
import { translateGeneratedOffset } from './atom-translator.ts';
import type { PositionAtom } from './declaration-remover.ts';
import {
    buildLineIndex,
    lineColumnToOffset,
    offsetToLineColumn,
    type LineColumn,
    type LineIndex
} from './line-index.ts';

export type RecomposeInput = {
    readonly originalMap: string;
    readonly originalCode: string;
    readonly transformedCode: string;
    readonly atoms: readonly PositionAtom[];
};

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
