import {
    eachMapping,
    encodedMappings,
    presortedDecodedMap,
    TraceMap,
    type EachMapping,
    type SourceMapSegment
} from '@jridgewell/trace-mapping';
import { translateGeneratedOffset, type SourceMapTransform } from './atom-translator.ts';
import { lineColumnToOffset, offsetToLineColumn, type LineColumn } from './line-index.ts';

type SourceMapMappings = readonly (readonly SourceMapSegment[])[];

type TranslationResult = {
    readonly mappings: SourceMapMappings;
    readonly sawMapping: boolean;
};

type SourceMapSegmentStore = {
    readonly append: (lineIndex: number, segment: SourceMapSegment) => void;
    readonly toMappings: () => SourceMapMappings;
};

function tryParseTraceMap(originalMap: string): TraceMap | null {
    try {
        return new TraceMap(originalMap);
    } catch {
        return null;
    }
}

function namedSegment(
    generated: LineColumn,
    traceMap: TraceMap,
    mapping: Extract<EachMapping, { readonly originalLine: number; }>
): SourceMapSegment {
    const sourceIndex = traceMap.sources.indexOf(mapping.source);
    const originalLine = mapping.originalLine - 1;
    if (mapping.name === null) {
        return [ generated.column, sourceIndex, originalLine, mapping.originalColumn ];
    }
    const nameIndex = traceMap.names.indexOf(mapping.name);
    return [ generated.column, sourceIndex, originalLine, mapping.originalColumn, nameIndex ];
}

function createSourceMapSegmentStore(): SourceMapSegmentStore {
    const mappings: SourceMapSegment[][] = [];
    return {
        append(lineIndex: number, segment: SourceMapSegment): void {
            const line = mappings[lineIndex];
            if (line === undefined) {
                mappings[lineIndex] = [ segment ];
            } else {
                line.push(segment);
            }
        },
        toMappings(): SourceMapMappings {
            return Array.from({ length: mappings.length }, function (_ignoredValue, index) {
                return mappings[index] ?? [];
            });
        }
    };
}

function translatedMappings(
    traceMap: TraceMap,
    transform: SourceMapTransform
): TranslationResult {
    const mappings = createSourceMapSegmentStore();
    let sawMapping = false;
    eachMapping(traceMap, function (mapping) {
        sawMapping = true;
        if (mapping.source !== null) {
            const oldOffset = lineColumnToOffset(
                transform.originalLineIndex,
                mapping.generatedLine,
                mapping.generatedColumn
            );
            const newOffset = translateGeneratedOffset(oldOffset, transform.atoms);
            if (newOffset !== undefined) {
                const generated = offsetToLineColumn(transform.transformedLineIndex, newOffset);
                mappings.append(generated.line - 1, namedSegment(generated, traceMap, mapping));
            }
        }
    });
    return { mappings: mappings.toMappings(), sawMapping };
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
