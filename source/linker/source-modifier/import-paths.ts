import path from 'node:path';
import type { Project, SourceFile } from 'ts-morph';
import { resolveSourceFileForLiteral } from '../../dependency-scanner/source-file-references.js';
import { getSourcePathFromSourceFile } from '../../dependency-scanner/typescript-project-analyzer.js';

function useBasenameFromSource(sourceFile: string, targetFile: string): string {
    const basename = path.basename(sourceFile);
    const dirname = path.dirname(targetFile);
    return path.join(dirname, basename);
}

type Replacements = ReadonlyMap<string, string>;

function applyImportPathReplacements(sourceFile: SourceFile, replacements: Replacements): void {
    for (const literal of sourceFile.getImportStringLiterals()) {
        const resolvedSourceFile = resolveSourceFileForLiteral(literal, sourceFile);
        if (resolvedSourceFile !== undefined) {
            const replacement = replacements.get(getSourcePathFromSourceFile(resolvedSourceFile));
            if (replacement !== undefined) {
                if (resolvedSourceFile.isDeclarationFile()) {
                    literal.setLiteralValue(useBasenameFromSource(literal.getLiteralValue(), replacement));
                } else {
                    literal.setLiteralValue(replacement);
                }
            }
        }
    }
}

export function replaceImportPaths(
    project: Project | undefined,
    sourceFilePath: string,
    sourceContent: string,
    replacements: Replacements
): string {
    if (project === undefined) {
        return sourceContent;
    }
    const sourceFile = project.getSourceFile(sourceFilePath);
    if (sourceFile === undefined) {
        return sourceContent;
    }
    applyImportPathReplacements(sourceFile, replacements);
    return sourceFile.getFullText();
}
