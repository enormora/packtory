import { Node as TypeScriptMorphNode, type SourceFile, type Statement } from 'ts-morph';
import type { DeadCodeEliminationSettings } from '../../configuration/dead-code-elimination-settings.ts';
import type { SideEffectClassifier } from '../side-effect-classifier.ts';

export function collectImpureStatements(
    sourceFile: Readonly<SourceFile>,
    deadCodeElimination: DeadCodeEliminationSettings | undefined,
    classifySideEffects: SideEffectClassifier
): readonly Statement[] {
    return classifySideEffects(sourceFile, deadCodeElimination)
        .map(function (effect) {
            return effect.statement;
        })
        .filter(function (statement) {
            return !TypeScriptMorphNode.isImportDeclaration(statement);
        });
}
