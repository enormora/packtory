import type { DeadCodeEliminationSettings } from '../configuration/dead-code-elimination-settings.ts';
import {
    createSideEffectClassifier,
    type SideEffectClassifier
} from '../dead-code-eliminator/side-effect-classifier.ts';
import { establishIntrinsicIntegrity } from '../dead-code-eliminator/evaluation/intrinsic-integrity.ts';
import { createProject } from './typescript-project.ts';

export const classifySideEffects: SideEffectClassifier = function (sourceFile, settings) {
    return createSideEffectClassifier([])(sourceFile, settings);
};

export function classify(
    content: string,
    settings?: DeadCodeEliminationSettings
): readonly { readonly line: number; readonly kind: string; }[] {
    const project = createProject({ withFiles: [ { filePath: 'index.ts', content } ] });
    establishIntrinsicIntegrity(project.getSourceFiles());
    const result = classifySideEffects(project.getSourceFileOrThrow('index.ts'), settings);
    return result.map(function (effect) {
        return { line: effect.statement.getStartLineNumber(), kind: effect.kind };
    });
}
