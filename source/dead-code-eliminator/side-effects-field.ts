import type { AnalyzedBundleResource } from './analyzed-bundle.ts';

const codeFilePattern = /(?:\.d\.ts|\.[cm]?[jt]sx?)$/;

export function isCodeFile(targetFilePath: string): boolean {
    return codeFilePattern.test(targetFilePath);
}

function fileHasSideEffects(resource: AnalyzedBundleResource): boolean {
    return resource.analysis.sideEffectStatements.length > 0;
}

// eslint-disable-next-line sonarjs/function-return-type -- the three distinct values (false / string[] / undefined) carry different semantics
export function computeSideEffectsField(
    contents: readonly AnalyzedBundleResource[]
): readonly string[] | false | undefined {
    const codeFiles = contents.filter((resource) => {
        return isCodeFile(resource.fileDescription.targetFilePath);
    });
    const impureFiles = codeFiles.filter(fileHasSideEffects);
    if (impureFiles.length === 0) {
        return false;
    }
    if (impureFiles.length === codeFiles.length) {
        return undefined;
    }
    return impureFiles
        .map((resource) => {
            return `./${resource.fileDescription.targetFilePath}`;
        })
        .toSorted((left, right) => {
            return left.localeCompare(right);
        });
}
