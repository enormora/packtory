import type { Project, SourceFile } from 'ts-morph';
import { buildLineIndex } from '../../dead-code-eliminator/transform/line-index.ts';
import type { PositionAtom, SourceMapTransform } from '../../dead-code-eliminator/transform/atom-translator.ts';
import {
    getModuleReferenceLiterals,
    resolveSourceFileForLiteral
} from '../../dependency-scanner/source-file-references.ts';
import { getSourcePathFromSourceFile } from '../../dependency-scanner/typescript-project-analyzer.ts';
import type { ImportPathReplacement } from '../replacement-lookup.ts';

type Replacements = ReadonlyMap<string, ImportPathReplacement>;

export type ImportPathDependencyReference = {
    readonly name: string;
    readonly sourceSpecifier: string;
    readonly emittedSpecifier: string;
};

type LiteralEdit = {
    readonly start: number;
    readonly end: number;
    readonly reference: ImportPathDependencyReference;
};

export type ImportPathReplacementResult = {
    readonly content: string;
    readonly dependencyReferences: readonly ImportPathDependencyReference[];
    readonly sourceMapTransform: SourceMapTransform | undefined;
};

function collectImportPathEdits(sourceFile: SourceFile, replacements: Replacements): readonly LiteralEdit[] {
    const edits: LiteralEdit[] = [];
    const literals = getModuleReferenceLiterals(sourceFile);
    for (const literal of literals) {
        const resolvedSourceFile = resolveSourceFileForLiteral(literal, sourceFile);
        if (resolvedSourceFile !== undefined) {
            const replacement = replacements.get(getSourcePathFromSourceFile(resolvedSourceFile));
            if (replacement !== undefined) {
                edits.push({
                    start: literal.getStart() + 1,
                    end: literal.getEnd() - 1,
                    reference: {
                        name: replacement.packageName,
                        sourceSpecifier: literal.getLiteralValue(),
                        emittedSpecifier: replacement.emittedSpecifier
                    }
                });
            }
        }
    }
    return edits.toSorted(function (left, right) {
        return left.start - right.start;
    });
}

function applyEdits(sourceContent: string, edits: readonly LiteralEdit[]): ImportPathReplacementResult {
    let content = '';
    let originalOffset = 0;
    const atoms: PositionAtom[] = [];

    function appendEdit(edit: LiteralEdit): void {
        const newStart = content.length;
        content += sourceContent.slice(originalOffset, edit.start) + edit.reference.emittedSpecifier;
        atoms.push({ originalStart: originalOffset, originalEnd: edit.start, newStart });
        originalOffset = edit.end;
    }

    function appendTail(): void {
        const tailStart = content.length;
        content += sourceContent.slice(originalOffset);
        atoms.push({
            originalStart: originalOffset,
            originalEnd: sourceContent.length,
            newStart: tailStart
        });
    }

    for (const edit of edits) {
        appendEdit(edit);
    }
    appendTail();
    return {
        content,
        dependencyReferences: edits.map(function (edit) {
            return edit.reference;
        }),
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
        return { content: sourceContent, dependencyReferences: [], sourceMapTransform: undefined };
    }
    const sourceFile = project.getSourceFile(sourceFilePath);
    if (sourceFile === undefined) {
        return { content: sourceContent, dependencyReferences: [], sourceMapTransform: undefined };
    }
    const edits = collectImportPathEdits(sourceFile, replacements);
    if (edits.length === 0) {
        return { content: sourceContent, dependencyReferences: [], sourceMapTransform: undefined };
    }
    return applyEdits(sourceContent, edits);
}
