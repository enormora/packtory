import type { Node as TypeScriptMorphNode, SourceFile } from 'ts-morph';
import { buildLineIndex, offsetToLineColumn } from './line-index.ts';
import { applySourceTextEdits, type PositionAtom, type SourceTextEdit, type TextTransformMap } from './text-edits.ts';

const maximumPreparationPasses = 32;

export function* preparationPasses<Preparation>(
    preparation: Preparation,
    readState: () => string
): Iterable<Preparation> {
    const pending = new Map([ [ readState(), preparation ] ]);
    const passes = pending.values().take(maximumPreparationPasses);
    for (const pass of passes) {
        yield pass;
        pending.set(readState(), preparation);
    }
}

type SourceRange = { readonly start: number; readonly end: number; };
export type SourceLineResolver = (node: TypeScriptMorphNode) => number;

export type SourcePreparation = {
    readonly sourceFile: SourceFile;
    readonly transformations: readonly TextTransformMap[];
    readonly applyEdits: (edits: readonly SourceTextEdit[]) => void;
    readonly originalLineFor: SourceLineResolver;
};

export function applySourcePreparation(
    preparation: SourcePreparation,
    editsFor: (source: SourceFile) => readonly SourceTextEdit[]
): void {
    const passes = preparationPasses(preparation, function () {
        return preparation.sourceFile.getFullText();
    });
    for (const pass of passes) {
        const edits = editsFor(pass.sourceFile);
        pass.applyEdits(edits);
    }
}

function retainedRange(range: SourceRange, atom: PositionAtom): SourceRange | undefined {
    const start = Math.max(range.start, atom.newStart);
    const end = Math.min(Math.max(range.end, range.start + 1), atom.newStart + atom.originalEnd - atom.originalStart);
    return start < end
        ? {
            start: atom.originalStart + start - atom.newStart,
            end: atom.originalStart + end - atom.newStart
        }
        : undefined;
}

function replacementRange(range: SourceRange, transformation: TextTransformMap): SourceRange {
    let start = 0;
    let end = transformation.originalCode.length;
    for (const atom of transformation.atoms) {
        if (atom.newStart + atom.originalEnd - atom.originalStart <= range.start) {
            start = atom.originalEnd;
        }
        if (atom.newStart > range.start) {
            end = atom.originalStart;
            break;
        }
    }
    return { start, end };
}

function originalRange(range: SourceRange, transformation: TextTransformMap): SourceRange {
    const retained = transformation.atoms.flatMap(function (atom) {
        const translated = retainedRange(range, atom);
        return translated === undefined ? [] : [ translated ];
    });
    const [ first ] = retained;
    return first === undefined
        ? replacementRange(range, transformation)
        : retained.reduce(function (combined, last) {
            return { start: combined.start, end: last.end };
        }, first);
}

export function createSourcePreparation(sourceFile: SourceFile): SourcePreparation {
    const originalLines = buildLineIndex(sourceFile.getFullText());
    const transformations: TextTransformMap[] = [];
    return {
        sourceFile,
        transformations,
        applyEdits(edits) {
            if (edits.length > 0) {
                const transformation = applySourceTextEdits(sourceFile.getFullText(), edits);
                sourceFile.applyTextChanges(edits.map(function (edit) {
                    return {
                        span: { start: edit.start, length: edit.end - edit.start },
                        newText: edit.content
                    };
                }));
                transformations.push(transformation);
            }
        },
        originalLineFor(node) {
            const range = transformations.reduceRight(originalRange, { start: node.getStart(), end: node.getEnd() });
            return offsetToLineColumn(originalLines, range.start).line;
        }
    };
}
