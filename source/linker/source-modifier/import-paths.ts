import type { Project, SourceFile } from 'ts-morph';
import { resolveSourceFileForLiteral } from '../../dependency-scanner/source-file-references.js';
import { getSourcePathFromSourceFile } from '../../dependency-scanner/typescript-project-analyzer.js';

type Replacements = ReadonlyMap<string, string>;

function applyImportPathReplacements(sourceFile: SourceFile, replacements: Replacements): void {
    for (const literal of sourceFile.getImportStringLiterals()) {
        const resolvedSourceFile = resolveSourceFileForLiteral(literal, sourceFile);
        if (resolvedSourceFile !== undefined) {
            const replacement = replacements.get(getSourcePathFromSourceFile(resolvedSourceFile));
            if (replacement !== undefined) {
                literal.setLiteralValue(replacement);
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
