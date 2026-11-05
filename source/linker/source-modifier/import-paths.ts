import type { Project, SourceFile } from 'ts-morph';
import {
    applySourceTextEdits,
    toSourceMapTransform,
    type SourceMapTransform
} from '../../source-transformation/text-edits.ts';
import { getModuleReferenceLiterals } from '../../dependency-scanner/source-file-references.ts';
import { resolveTypescriptModuleFilePath } from '../../dependency-scanner/typescript-module-resolution.ts';
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
    const literals = getModuleReferenceLiterals(sourceFile);
    const edits = literals.flatMap<LiteralEdit>(function replacementEdits(literal) {
        const resolvedFilePath = resolveTypescriptModuleFilePath({
            moduleSpecifier: literal.getLiteralValue(),
            containingSourceFile: sourceFile,
            containingFilePath: sourceFile.getFilePath(),
            resolutionMode: 'type'
        });
        if (resolvedFilePath === undefined) {
            return [];
        }
        const replacement = replacements.get(resolvedFilePath);
        if (replacement === undefined) {
            return [];
        }
        return [ {
            start: literal.getStart() + 1,
            end: literal.getEnd() - 1,
            reference: {
                name: replacement.packageName,
                sourceSpecifier: literal.getLiteralValue(),
                emittedSpecifier: replacement.emittedSpecifier
            }
        } ];
    });
    return edits.toSorted(function (left, right) {
        return left.start - right.start;
    });
}

function applyEdits(sourceContent: string, edits: readonly LiteralEdit[]): ImportPathReplacementResult {
    const transform = applySourceTextEdits(
        sourceContent,
        edits.map(function (edit) {
            return { start: edit.start, end: edit.end, content: edit.reference.emittedSpecifier };
        })
    );
    return {
        content: transform.transformedCode,
        dependencyReferences: edits.map(function (edit) {
            return edit.reference;
        }),
        sourceMapTransform: toSourceMapTransform(transform)
    };
}

export function replaceImportPathsWithTransform(
    project: Project | undefined,
    inputFilePath: string,
    sourceContent: string,
    replacements: Replacements
): ImportPathReplacementResult {
    if (project === undefined) {
        return { content: sourceContent, dependencyReferences: [], sourceMapTransform: undefined };
    }
    const sourceFile = project.getSourceFile(inputFilePath);
    if (sourceFile === undefined) {
        return { content: sourceContent, dependencyReferences: [], sourceMapTransform: undefined };
    }
    const edits = collectImportPathEdits(sourceFile, replacements);
    if (edits.length === 0) {
        return { content: sourceContent, dependencyReferences: [], sourceMapTransform: undefined };
    }
    return applyEdits(sourceContent, edits);
}
