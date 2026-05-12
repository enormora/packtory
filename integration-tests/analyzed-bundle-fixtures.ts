import { createEmptyFileAnalysis, type FileAnalysis } from '../source/dead-code-eliminator/analyzed-bundle.ts';

export function bindingAnalysis(...names: readonly string[]): FileAnalysis {
    return { ...createEmptyFileAnalysis(), survivingBindings: new Set<string>(names) };
}

export const emptyAnalysis: FileAnalysis = createEmptyFileAnalysis();
