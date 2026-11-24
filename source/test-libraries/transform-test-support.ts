import type { SourceFile } from 'ts-morph';
import { establishIntrinsicIntegrity } from '../dead-code-eliminator/evaluation/intrinsic-integrity.ts';
import { createProject } from './typescript-project.ts';

export function withSource(content: string): SourceFile {
    const project = createProject({ withFiles: [ { filePath: '/source.ts', content } ] });
    establishIntrinsicIntegrity(project.getSourceFiles());
    return project.getSourceFileOrThrow('/source.ts');
}
