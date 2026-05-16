import { Node as TsMorphNode, type SourceFile, type Statement } from 'ts-morph';
import type { DeadCodeEliminationSettings } from '../../config/dead-code-elimination-settings.ts';
import { classifySideEffects } from '../side-effect-classifier.ts';

export function collectImpureStatements(
    sourceFile: Readonly<SourceFile>,
    deadCodeElimination: DeadCodeEliminationSettings | undefined
): readonly Statement[] {
    const impureLines = new Set<number>();
    for (const statement of classifySideEffects(sourceFile, deadCodeElimination)) {
        impureLines.add(statement.line);
    }
    return sourceFile.getStatements().filter((statement) => {
        return impureLines.has(statement.getStartLineNumber()) && !TsMorphNode.isImportDeclaration(statement);
    });
}
