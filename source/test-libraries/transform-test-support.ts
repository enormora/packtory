import type { SourceFile } from 'ts-morph';
import { resolveRuntimeModule } from '../dead-code-eliminator/runtime-module-resolution.ts';
import { establishEvaluationEnvironment } from '../dead-code-eliminator/evaluation/evaluation-environment-establishment.ts';
import { createProject } from './typescript-project.ts';

export function withSource(content: string): SourceFile {
    const project = createProject({ withFiles: [ { filePath: '/source.ts', content } ] });
    establishEvaluationEnvironment(project.getSourceFiles(), undefined, resolveRuntimeModule);
    return project.getSourceFileOrThrow('/source.ts');
}
