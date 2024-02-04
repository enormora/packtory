import type { SourceFile } from 'ts-morph';
import { resolveSourceFileForLiteral } from '../dependency-scanner/source-file-references.js';
import { getSourcePathFromSourceFile } from '../dependency-scanner/typescript-project-analyzer.js';

type Replacements = ReadonlyMap<string, string>;

export function replaceImportPaths(sourceFile: Readonly<SourceFile>, replacements: Readonly<Replacements>): string {
    const importStringLiterals = sourceFile.getImportStringLiterals();

    for (const literal of importStringLiterals) {
        const sourceFileForLiteral = resolveSourceFileForLiteral(literal, sourceFile);
        if (sourceFileForLiteral !== undefined) {
            const fullPathForLiteral = getSourcePathFromSourceFile(sourceFileForLiteral);
            const replacement = replacements.get(fullPathForLiteral);

            if (replacement !== undefined) {
                literal.setLiteralValue(replacement);
            }
        }
    }

    return sourceFile.getFullText();
}
