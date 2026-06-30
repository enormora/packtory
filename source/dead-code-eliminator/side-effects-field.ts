import { isCodeFile } from '../common/code-files.ts';
import type { AnalyzedBundleResource } from './analyzed-bundle.ts';

function fileHasSideEffects(resource: AnalyzedBundleResource): boolean {
    return resource.analysis.sideEffectStatements.length > 0;
}

export function computeSideEffectsField(
    contents: readonly AnalyzedBundleResource[]
): readonly string[] | false | undefined {
    const codeFiles = contents.filter(function (resource) {
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
        .map(function (resource) {
            return `./${resource.fileDescription.targetFilePath}`;
        })
        .toSorted(function (left, right) {
            return left.localeCompare(right);
        });
}
