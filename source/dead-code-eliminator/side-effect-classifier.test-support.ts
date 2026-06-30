import type { DeadCodeEliminationSettings } from '../config/dead-code-elimination-settings.ts';
import { createProject } from '../test-libraries/typescript-project.ts';
import { classifySideEffects } from './side-effect-classifier.ts';

export function classify(
    content: string,
    settings?: DeadCodeEliminationSettings
): readonly { readonly line: number; readonly kind: string; }[] {
    const project = createProject({ withFiles: [ { filePath: 'index.ts', content } ] });
    const result = classifySideEffects(project.getSourceFileOrThrow('index.ts'), settings);
    return result.map(function (statement) {
        return { line: statement.line, kind: statement.kind };
    });
}
