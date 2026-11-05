import SourceEditor from 'magic-string';
import { diffChars } from 'diff';
import { buildLineIndex, type LineIndex } from './line-index.ts';

export type PositionAtom = {
    readonly originalStart: number;
    readonly originalEnd: number;
    readonly newStart: number;
};

export type TextTransformMap = {
    readonly originalCode: string;
    readonly transformedCode: string;
    readonly atoms: readonly PositionAtom[];
};

export type SourceMapTransform = {
    readonly originalLineIndex: LineIndex;
    readonly transformedLineIndex: LineIndex;
    readonly atoms: readonly PositionAtom[];
};

export type SourceTextEdit = {
    readonly start: number;
    readonly end: number;
    readonly content: string;
};

function retainedTextRanges(originalLength: number, edits: readonly SourceTextEdit[]): readonly PositionAtom[] {
    const atoms: PositionAtom[] = [];
    let originalOffset = 0;
    let displacement = 0;
    for (const edit of edits) {
        atoms.push({ originalStart: originalOffset, originalEnd: edit.start, newStart: originalOffset + displacement });
        displacement += edit.content.length - (edit.end - edit.start);
        originalOffset = edit.end;
    }
    atoms.push({ originalStart: originalOffset, originalEnd: originalLength, newStart: originalOffset + displacement });
    return atoms;
}

export function applySourceTextEdits(originalCode: string, edits: readonly SourceTextEdit[]): TextTransformMap {
    const source = new SourceEditor(originalCode);
    for (const edit of edits) {
        if (edit.start === edit.end) {
            source.appendLeft(edit.start, edit.content);
        } else {
            source.update(edit.start, edit.end, edit.content);
        }
    }
    return { originalCode, transformedCode: source.toString(), atoms: retainedTextRanges(originalCode.length, edits) };
}

export function buildTextTransformMap(originalCode: string, transformedCode: string): TextTransformMap {
    let originalOffset = 0;
    const edits = diffChars(originalCode, transformedCode).flatMap(function (change): readonly SourceTextEdit[] {
        const start = originalOffset;
        if (!change.added) {
            originalOffset += change.value.length;
        }
        return change.added || change.removed
            ? [ { start, end: originalOffset, content: change.added ? change.value : '' } ]
            : [];
    });
    return applySourceTextEdits(originalCode, edits);
}

export function toSourceMapTransform(textTransform: TextTransformMap): SourceMapTransform {
    return {
        originalLineIndex: buildLineIndex(textTransform.originalCode),
        transformedLineIndex: buildLineIndex(textTransform.transformedCode),
        atoms: textTransform.atoms
    };
}

function findAtomFor(atoms: readonly PositionAtom[], offset: number): PositionAtom | undefined {
    return atoms.find(function (atom) {
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
