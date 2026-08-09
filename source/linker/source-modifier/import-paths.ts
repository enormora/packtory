import type { Project, SourceFile, StringLiteral } from 'ts-morph';
import { buildLineIndex } from '../../dead-code-eliminator/transform/line-index.ts';
import type { PositionAtom, SourceMapTransform } from '../../dead-code-eliminator/transform/atom-translator.ts';
import {
    getImportMetaResolveLiterals,
    resolveSourceFileForLiteral
} from '../../dependency-scanner/source-file-references.ts';
import { getSourcePathFromSourceFile } from '../../dependency-scanner/typescript-project-analyzer.ts';

type Replacements = ReadonlyMap<string, string>;

type LiteralEdit = {
    readonly start: number;
    readonly end: number;
    readonly replacement: string;
};

type EditApplication = {
    readonly content: string;
    readonly atoms: readonly PositionAtom[];
};

type EditState = EditApplication & {
    readonly originalOffset: number;
    readonly transformedOffset: number;
};

export type ImportPathReplacementResult = {
    readonly content: string;
    readonly sourceMapTransform: SourceMapTransform | undefined;
};

const unchangedResultSourceMapTransform = undefined;

function importPathLiterals(sourceFile: SourceFile): readonly StringLiteral[] {
    return [
        ...sourceFile.getImportStringLiterals(),
        ...getImportMetaResolveLiterals(sourceFile)
    ];
}

function literalEdit(literal: StringLiteral, replacement: string): LiteralEdit {
    return {
        start: literal.getStart() + 1,
        end: literal.getEnd() - 1,
        replacement
    };
}

function collectImportPathEdits(sourceFile: SourceFile, replacements: Replacements): readonly LiteralEdit[] {
    const edits: LiteralEdit[] = [];
    for (const literal of importPathLiterals(sourceFile)) {
        const resolvedSourceFile = resolveSourceFileForLiteral(literal, sourceFile);
        if (resolvedSourceFile !== undefined) {
            const replacement = replacements.get(getSourcePathFromSourceFile(resolvedSourceFile));
            if (replacement !== undefined) {
                edits.push(literalEdit(literal, replacement));
            }
        }
    }
    return edits.toSorted(function (left, right) {
        return left.start - right.start;
    });
}

function appendUnchangedAtom(
    atoms: readonly PositionAtom[],
    originalStart: number,
    originalEnd: number,
    newStart: number
): readonly PositionAtom[] {
    return [ ...atoms, { originalStart, originalEnd, newStart } ];
}

function initialEditState(): EditState {
    return { originalOffset: 0, transformedOffset: 0, content: '', atoms: [] };
}

function appendEdit(sourceContent: string, state: EditState, edit: LiteralEdit): EditState {
    const unchanged = sourceContent.slice(state.originalOffset, edit.start);
    return {
        originalOffset: edit.end,
        transformedOffset: state.transformedOffset + unchanged.length + edit.replacement.length,
        content: `${state.content}${unchanged}${edit.replacement}`,
        atoms: appendUnchangedAtom(state.atoms, state.originalOffset, edit.start, state.transformedOffset)
    };
}

function finishEdits(sourceContent: string, state: EditState): EditApplication {
    return {
        content: `${state.content}${sourceContent.slice(state.originalOffset)}`,
        atoms: appendUnchangedAtom(state.atoms, state.originalOffset, sourceContent.length, state.transformedOffset)
    };
}

function applyEdits(sourceContent: string, edits: readonly LiteralEdit[]): EditApplication {
    return finishEdits(
        sourceContent,
        edits.reduce(function (state, edit) {
            return appendEdit(sourceContent, state, edit);
        }, initialEditState())
    );
}

function sourceMapTransform(
    sourceContent: string,
    transformedContent: string,
    atoms: readonly PositionAtom[]
): SourceMapTransform {
    return {
        originalLineIndex: buildLineIndex(sourceContent),
        transformedLineIndex: buildLineIndex(transformedContent),
        atoms
    };
}

export function replaceImportPathsWithTransform(
    project: Project | undefined,
    sourceFilePath: string,
    sourceContent: string,
    replacements: Replacements
): ImportPathReplacementResult {
    if (project === undefined) {
        return { content: sourceContent, sourceMapTransform: unchangedResultSourceMapTransform };
    }
    const sourceFile = project.getSourceFile(sourceFilePath);
    if (sourceFile === undefined) {
        return { content: sourceContent, sourceMapTransform: unchangedResultSourceMapTransform };
    }
    const edits = collectImportPathEdits(sourceFile, replacements);
    if (edits.length === 0) {
        return { content: sourceContent, sourceMapTransform: unchangedResultSourceMapTransform };
    }
    const { content, atoms } = applyEdits(sourceContent, edits);
    return { content, sourceMapTransform: sourceMapTransform(sourceContent, content, atoms) };
}
