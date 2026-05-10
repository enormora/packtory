import type { FileAnalysis } from '../source/dead-code-eliminator/analyzed-bundle.ts';

export function bindingAnalysis(...names: readonly string[]): FileAnalysis {
    return {
        survivingBindings: new Set<string>(names),
        sideEffectStatements: [],
        sideEffectImports: new Set<string>()
    };
}

export const emptyAnalysis: FileAnalysis = bindingAnalysis();
