import type { Node as TypeScriptMorphNode, SourceFile } from 'ts-morph';
import { buildLineIndex, offsetToLineColumn } from './line-index.ts';
import { applySourceTextEdits, type PositionAtom, type SourceTextEdit, type TextTransformMap } from './text-edits.ts';

type SourceRange = { readonly start: number; readonly end: number; };
export type SourceLineResolver = (node: TypeScriptMorphNode) => number;

export type SourcePreparation = {
    readonly sourceFile: SourceFile;
    readonly transformations: readonly TextTransformMap[];
    readonly applyEdits: (edits: readonly SourceTextEdit[]) => void;
    readonly originalLineFor: SourceLineResolver;
};

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
    const following = transformation.atoms.find(function (atom) {
        return atom.newStart > range.start;
    });
    const previous = transformation.atoms.findLast(function (atom) {
        return atom.newStart + atom.originalEnd - atom.originalStart <= range.start;
    });
    return { start: previous?.originalEnd ?? 0, end: following?.originalStart ?? transformation.originalCode.length };
}

function originalRange(range: SourceRange, transformation: TextTransformMap): SourceRange {
    const retained = transformation.atoms.flatMap(function (atom) {
        const translated = retainedRange(range, atom);
        return translated === undefined ? [] : [ translated ];
    });
    const first = retained[0];
    const last = retained.at(-1);
    return first === undefined || last === undefined
        ? replacementRange(range, transformation)
        : { start: first.start, end: last.end };
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
                sourceFile.replaceWithText(transformation.transformedCode);
                transformations.push(transformation);
            }
        },
        originalLineFor(node) {
            let range = { start: node.getStart(), end: node.getEnd() };
            for (const transformation of transformations.toReversed()) {
                range = originalRange(range, transformation);
            }
            return offsetToLineColumn(originalLines, range.start).line;
        }
    };
}
