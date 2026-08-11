import { addMapping, GenMapping, toEncodedMap } from '@jridgewell/gen-mapping';
import { eachMapping, TraceMap } from '@jridgewell/trace-mapping';
import { translateGeneratedOffset, type SourceMapTransform } from './atom-translator.ts';
import { lineColumnToOffset, offsetToLineColumn } from './line-index.ts';

function tryParseTraceMap(originalMap: string): TraceMap | null {
    try {
        return new TraceMap(originalMap);
    } catch {
        return null;
    }
}

function appendTranslatedMappings(
    mappingsBuilder: GenMapping,
    traceMap: TraceMap,
    transform: SourceMapTransform
): boolean {
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
                addMapping(mappingsBuilder, {
                    generated: offsetToLineColumn(transform.transformedLineIndex, newOffset),
                    source: mapping.source,
                    original: { line: mapping.originalLine, column: mapping.originalColumn }
                });
            }
        }
    });
    return sawMapping;
}

function recomposeWithTransform(originalMap: string, transform: SourceMapTransform): string {
    const traceMap = tryParseTraceMap(originalMap);
    if (traceMap === null) {
        return originalMap;
    }
    const mappingsBuilder = new GenMapping();
    if (!appendTranslatedMappings(mappingsBuilder, traceMap, transform)) {
        return originalMap;
    }
    return JSON.stringify({
        version: 3,
        file: traceMap.file === null ? undefined : traceMap.file,
        sourceRoot: traceMap.sourceRoot,
        sources: traceMap.sources,
        sourcesContent: traceMap.sourcesContent,
        names: traceMap.names,
        mappings: toEncodedMap(mappingsBuilder).mappings
    });
}

export function recomposeSourceMap(
    originalMap: string,
    sourceMapTransforms: readonly SourceMapTransform[]
): string {
    return sourceMapTransforms.reduce(recomposeWithTransform, originalMap);
}
