import { Node as TypeScriptMorphNode, type SourceFile, type Statement } from 'ts-morph';
import type { SideEffectClassifier } from '../side-effect-classifier.ts';

export function collectImpureStatements(
    sourceFile: Readonly<SourceFile>,
    classifySideEffects: SideEffectClassifier
): readonly Statement[] {
    return classifySideEffects(sourceFile)
        .map(function (effect) {
            return effect.statement;
        })
        .filter(function (statement) {
            return !TypeScriptMorphNode.isImportDeclaration(statement);
        });
}
