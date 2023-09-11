import {SourceFile} from 'ts-morph';
import {resolveSourceFileForLiteral} from '../dependency-scanner/source-file-references.js';
import {getSourcePathFromSourceFile} from '../dependency-scanner/typescript-project-analyzer.js';

type Replacements = Map<string, string>;

export function replaceImportPaths(sourceFile: SourceFile, replacements: Replacements, resolveDeclarationFiles: boolean): string {
    const importStringLiterals = sourceFile.getImportStringLiterals();

    for (const literal of importStringLiterals) {
        const sourceFileForLiteral = resolveSourceFileForLiteral(literal, sourceFile)
        if (sourceFileForLiteral) {
            const fullPathForLiteral = getSourcePathFromSourceFile(sourceFileForLiteral, resolveDeclarationFiles);
            const replacement = replacements.get(fullPathForLiteral);

            if (replacement) {
                literal.replaceWithText(`'${replacement}'`);
            }
        }
    }

    return sourceFile.getText();
}
