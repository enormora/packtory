import { Node as TypeScriptMorphNode, type SourceFile, type Statement } from 'ts-morph';
import type { DeadCodeEliminationSettings } from '../../configuration/dead-code-elimination-settings.ts';
import type { SideEffectClassifier } from '../side-effect-classifier.ts';

export function collectImpureStatements(
    sourceFile: Readonly<SourceFile>,
    deadCodeElimination: DeadCodeEliminationSettings | undefined,
    classifySideEffects: SideEffectClassifier
): readonly Statement[] {
    const impureLines = new Set<number>();
    for (const statement of classifySideEffects(sourceFile, deadCodeElimination)) {
        impureLines.add(statement.line);
    }
    return sourceFile.getStatements().filter(function (statement) {
        return impureLines.has(statement.getStartLineNumber()) && !TypeScriptMorphNode.isImportDeclaration(statement);
    });
}
