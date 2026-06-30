export type LineColumn = { readonly line: number; readonly column: number; };

type LineIndexEntry = {
    readonly lineNumber: number;
    readonly lineStart: number;
};

export type LineIndex = readonly LineIndexEntry[];

export function buildLineIndex(text: string): LineIndex {
    const entries: LineIndexEntry[] = [ { lineNumber: 1, lineStart: 0 } ];
    for (const match of text.matchAll(/\n/gu)) {
        entries.push({ lineNumber: entries.length + 1, lineStart: match.index + 1 });
    }
    return entries;
}

export function lineColumnToOffset(lineIndex: LineIndex, oneBasedLine: number, column: number): number {
    const entry = lineIndex.find(function (candidate) {
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
