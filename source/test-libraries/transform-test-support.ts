import type { SourceFile } from 'ts-morph';
import { createProject } from './typescript-project.ts';

export function withSource(content: string): SourceFile {
    const project = createProject({ withFiles: [ { filePath: '/source.ts', content } ] });
    return project.getSourceFileOrThrow('/source.ts');
}
