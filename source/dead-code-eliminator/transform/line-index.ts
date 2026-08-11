export type LineColumn = { readonly line: number; readonly column: number; };

export type LineIndex = readonly number[];

export function buildLineIndex(text: string): LineIndex {
    const entries: number[] = [ 0 ];
    for (const match of text.matchAll(/\n/gu)) {
        entries.push(match.index + 1);
    }
    return entries;
}

export function lineColumnToOffset(lineIndex: LineIndex, oneBasedLine: number, column: number): number {
    return (lineIndex[oneBasedLine - 1] ?? 0) + column;
}

export function offsetToLineColumn(lineIndex: LineIndex, offset: number): LineColumn {
    let lineIndexOffset = 0;
    for (const [ index, lineStart ] of lineIndex.entries()) {
        if (lineStart > offset) {
            break;
        }
        lineIndexOffset = index;
    }
    return { line: lineIndexOffset + 1, column: offset - (lineIndex[lineIndexOffset] ?? 0) };
}
