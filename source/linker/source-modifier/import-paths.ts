import type { Project, SourceFile } from 'ts-morph';
import { buildLineIndex } from '../../dead-code-eliminator/transform/line-index.ts';
import type { PositionAtom, SourceMapTransform } from '../../dead-code-eliminator/transform/atom-translator.ts';
import {
    getImportMetaResolveLiterals,
    resolveSourceFileForLiteral
} from '../../dependency-scanner/source-file-references.ts';
import { getSourcePathFromSourceFile } from '../../dependency-scanner/typescript-project-analyzer.ts';

type Replacements = ReadonlyMap<string, string>;

type LiteralEdit = readonly [start: number, end: number, replacement: string];

export type ImportPathReplacementResult = {
    readonly content: string;
    readonly sourceMapTransform: SourceMapTransform | undefined;
};

function collectImportPathEdits(sourceFile: SourceFile, replacements: Replacements): readonly LiteralEdit[] {
    const edits: LiteralEdit[] = [];
    const literals = [
        ...sourceFile.getImportStringLiterals(),
        ...getImportMetaResolveLiterals(sourceFile)
    ];
    for (const literal of literals) {
        const resolvedSourceFile = resolveSourceFileForLiteral(literal, sourceFile);
        if (resolvedSourceFile !== undefined) {
            const replacement = replacements.get(getSourcePathFromSourceFile(resolvedSourceFile));
            if (replacement !== undefined) {
                edits.push([ literal.getStart() + 1, literal.getEnd() - 1, replacement ]);
            }
        }
    }
    return edits.toSorted(function (left, right) {
        return left[0] - right[0];
    });
}

function applyEdits(sourceContent: string, edits: readonly LiteralEdit[]): ImportPathReplacementResult {
    let content = '';
    let originalOffset = 0;
    let transformedOffset = 0;
    const atoms: PositionAtom[] = [];

    function appendEdit(edit: LiteralEdit): void {
        const [ start, end, replacement ] = edit;
        content += sourceContent.slice(originalOffset, start) + replacement;
        atoms.push({ originalStart: originalOffset, originalEnd: start, newStart: transformedOffset });
        transformedOffset = content.length;
        originalOffset = end;
    }

    for (const edit of edits) {
        appendEdit(edit);
    }
    content += sourceContent.slice(originalOffset);
    atoms.push({
        originalStart: originalOffset,
        originalEnd: sourceContent.length,
        newStart: transformedOffset
    });
    return {
        content,
        sourceMapTransform: {
            originalLineIndex: buildLineIndex(sourceContent),
            transformedLineIndex: buildLineIndex(content),
            atoms
        }
    };
}

export function replaceImportPathsWithTransform(
    project: Project | undefined,
    sourceFilePath: string,
    sourceContent: string,
    replacements: Replacements
): ImportPathReplacementResult {
    if (project === undefined) {
        return { content: sourceContent, sourceMapTransform: undefined };
    }
    const sourceFile = project.getSourceFile(sourceFilePath);
    if (sourceFile === undefined) {
        return { content: sourceContent, sourceMapTransform: undefined };
    }
    const edits = collectImportPathEdits(sourceFile, replacements);
    if (edits.length === 0) {
        return { content: sourceContent, sourceMapTransform: undefined };
    }
    return applyEdits(sourceContent, edits);
}
