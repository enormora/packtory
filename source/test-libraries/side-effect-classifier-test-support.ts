import type { DeadCodeEliminationSettings } from '../configuration/dead-code-elimination-settings.ts';
import {
    createSideEffectClassifier,
    type SideEffectClassifier
} from '../dead-code-eliminator/side-effect-classifier.ts';
import { resolveRuntimeModule } from '../dead-code-eliminator/runtime-module-resolution.ts';
import { establishEvaluationEnvironment } from '../dead-code-eliminator/evaluation/evaluation-environment-establishment.ts';
import { createProject } from './typescript-project.ts';

export const classifySideEffects: SideEffectClassifier = createSideEffectClassifier();

export function classify(
    content: string,
    settings?: DeadCodeEliminationSettings
): readonly { readonly line: number; readonly kind: string; }[] {
    const project = createProject({ withFiles: [ { filePath: 'index.ts', content } ] });
    establishEvaluationEnvironment(project.getSourceFiles(), settings, resolveRuntimeModule);
    const result = classifySideEffects(project.getSourceFileOrThrow('index.ts'));
    return result.map(function (effect) {
        return { line: effect.statement.getStartLineNumber(), kind: effect.kind };
    });
}
