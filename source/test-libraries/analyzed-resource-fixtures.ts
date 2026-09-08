import { createEmptyFileAnalysis, type AnalyzedBundleResource } from '../dead-code-eliminator/analyzed-bundle.ts';

export function codeResource(targetFilePath: string, content: string): AnalyzedBundleResource {
    return {
        fileDescription: {
            inputFilePath: `/src/${targetFilePath}`,
            targetFilePath,
            content,
            isExecutable: false
        },
        directDependencies: new Set<string>(),
        moduleReferences: [],
        isExplicitlyIncluded: true,
        isSubstituted: false,
        analysis: createEmptyFileAnalysis()
    };
}
