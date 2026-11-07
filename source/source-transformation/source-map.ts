import {
    decodedMappings,
    encodedMappings,
    presortedDecodedMap,
    TraceMap,
    type SourceMapSegment
} from '@jridgewell/trace-mapping';
import { translateGeneratedOffset, type SourceMapTransform } from './text-edits.ts';
import { lineColumnToOffset, offsetToLineColumn, type LineColumn } from './line-index.ts';

type SourceMapMappings = readonly (readonly SourceMapSegment[])[];

type TranslationResult = {
    readonly mappings: SourceMapMappings;
    readonly sawMapping: boolean;
};

function tryParseTraceMap(originalMap: string): TraceMap | null {
    try {
        return new TraceMap(originalMap);
    } catch {
        return null;
    }
}

function translatedSegment(
    generated: LineColumn,
    segment: Exclude<SourceMapSegment, readonly [number]>
): SourceMapSegment {
    const [ , sourceIndex, originalLine, originalColumn, nameIndex ] = segment;
    if (nameIndex === undefined) {
        return [ generated.column, sourceIndex, originalLine, originalColumn ];
    }
    return [ generated.column, sourceIndex, originalLine, originalColumn, nameIndex ];
}

function translatedMappings(
    traceMap: TraceMap,
    transform: SourceMapTransform
): TranslationResult {
    const mappings: SourceMapSegment[][] = [];
    let sawMapping = false;
    decodedMappings(traceMap).forEach(function (segments, lineIndex) {
        segments.forEach(function (segment) {
            sawMapping = true;
            if (segment.length === 1) {
                return;
            }
            const newOffset = translateGeneratedOffset(
                lineColumnToOffset(transform.originalLineIndex, lineIndex + 1, segment[0]),
                transform.atoms
            );
            if (newOffset !== undefined) {
                const generated = offsetToLineColumn(transform.transformedLineIndex, newOffset);
                const line = mappings[generated.line - 1] ?? [];
                line.push(translatedSegment(generated, segment));
                mappings[generated.line - 1] = line;
            }
        });
    });
    return {
        mappings: Array.from({ length: mappings.length }, function (_value, index) {
            return mappings[index] ?? [];
        }),
        sawMapping
    };
}

function recomposeWithTransform(originalMap: string, transform: SourceMapTransform): string {
    const traceMap = tryParseTraceMap(originalMap);
    if (traceMap === null) {
        return originalMap;
    }
    const translated = translatedMappings(traceMap, transform);
    if (!translated.sawMapping) {
        return originalMap;
    }
    return JSON.stringify({
        version: 3,
        file: traceMap.file === null ? undefined : traceMap.file,
        sourceRoot: traceMap.sourceRoot,
        sources: traceMap.sources,
        sourcesContent: traceMap.sourcesContent,
        names: traceMap.names,
        mappings: encodedMappings(presortedDecodedMap({
            version: 3,
            sources: Array.from(traceMap.sources),
            names: Array.from(traceMap.names),
            mappings: translated.mappings.map(function (line) {
                return Array.from(line);
            })
        }))
    });
}

export function recomposeSourceMap(
    originalMap: string,
    sourceMapTransforms: readonly SourceMapTransform[]
): string {
    return sourceMapTransforms.reduce(recomposeWithTransform, originalMap);
}
