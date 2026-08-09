import { addMapping, GenMapping, toEncodedMap } from '@jridgewell/gen-mapping';
import { eachMapping, TraceMap, type EachMapping } from '@jridgewell/trace-mapping';
import {
    toSourceMapTransform,
    translateGeneratedOffset,
    type SourceMapTransform,
    type TextTransformMap
} from './atom-translator.ts';
import { lineColumnToOffset, offsetToLineColumn, type LineColumn, type LineIndex } from './line-index.ts';

type TextTransformInput = {
    readonly originalMap: string;
    readonly textTransform: TextTransformMap;
};

type SourceMapTransformInput = {
    readonly originalMap: string;
    readonly sourceMapTransforms: readonly SourceMapTransform[];
};

export type RecomposeInput = SourceMapTransformInput | TextTransformInput;

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
    transform: Pick<SourceMapTransform, 'atoms'>
): TranslatedMapping | undefined {
    if (mapping.source === null) {
        return undefined;
    }
    const oldOffset = lineColumnToOffset(originalIndex, mapping.generatedLine, mapping.generatedColumn);
    const newOffset = translateGeneratedOffset(oldOffset, transform.atoms);
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

function hasMappings(traceMap: TraceMap): boolean {
    let count = 0;
    eachMapping(traceMap, function () {
        count += 1;
    });
    return count > 0;
}

function appendTranslatedMappings(
    mappingsBuilder: GenMapping,
    traceMap: TraceMap,
    transform: SourceMapTransform
): void {
    eachMapping(traceMap, function (mapping) {
        const translated = translateMapping(
            mapping,
            transform.originalLineIndex,
            transform.transformedLineIndex,
            transform
        );
        if (translated !== undefined) {
            appendMapping(mappingsBuilder, translated);
        }
    });
}

function recomposeWithTransform(originalMap: string, transform: SourceMapTransform): string {
    const traceMap = tryParseTraceMap(originalMap);
    if (traceMap === null) {
        return originalMap;
    }
    if (!hasMappings(traceMap)) {
        return originalMap;
    }
    const mappingsBuilder = new GenMapping();
    appendTranslatedMappings(mappingsBuilder, traceMap, transform);
    return buildOutputJson(traceMap, toEncodedMap(mappingsBuilder).mappings);
}

function hasSourceMapTransforms(input: RecomposeInput): input is SourceMapTransformInput {
    return Object.hasOwn(input, 'sourceMapTransforms');
}

function sourceMapTransformsFor(input: RecomposeInput): readonly SourceMapTransform[] {
    if (hasSourceMapTransforms(input)) {
        return input.sourceMapTransforms;
    }
    return [ toSourceMapTransform(input.textTransform) ];
}

export function recomposeSourceMap(input: RecomposeInput): string {
    return sourceMapTransformsFor(input).reduce(recomposeWithTransform, input.originalMap);
}
