import type { SourcePreparation } from '../../source-transformation/source-preparation.ts';
import type { PreparedModule } from '../exports/prepared-module-graph.ts';
import type { RuntimeModuleResolver } from '../runtime-module-resolution.ts';
import type { ExpressionPurityChecker } from '../imported-expression-origin.ts';
import { createBundleConstantEvaluator } from '../evaluation/bundle-constant-evaluation.ts';
import { prepareResolvedRuntimeSource } from './runtime-source-preparation.ts';

export function prepareBundleSources(
    preparations: readonly SourcePreparation[],
    modules: readonly PreparedModule[],
    resolveModule: RuntimeModuleResolver,
    isPure: ExpressionPurityChecker
): void {
    let changed = true;
    while (changed) {
        const previous = modules.map(function (file) {
            return file.sourceFile.getFullText();
        });
        const evaluateImport = createBundleConstantEvaluator(modules, resolveModule);
        for (const preparation of preparations) {
            prepareResolvedRuntimeSource(preparation, evaluateImport, isPure);
        }
        changed = modules.some(function (file, index) {
            return file.sourceFile.getFullText() !== previous[index];
        });
    }
}
