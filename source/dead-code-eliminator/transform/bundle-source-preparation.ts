import { SyntaxKind } from 'ts-morph';
import { preparationPasses, type SourcePreparation } from '../../source-transformation/source-preparation.ts';
import type { PreparedModule } from '../exports/prepared-module-graph.ts';
import type { RuntimeModuleResolver } from '../runtime-module-resolution.ts';
import type { ExpressionPurityChecker } from '../imported-expression-origin.ts';
import { createBundleConstantEvaluator } from '../evaluation/bundle-constant-evaluation.ts';
import { createModuleConstantSnapshot } from '../evaluation/module-constant-snapshot.ts';
import { prepareResolvedRuntimeSource } from './runtime-source-preparation.ts';

export function prepareBundleSources(
    preparations: readonly SourcePreparation[],
    modules: readonly PreparedModule[],
    resolveModule: RuntimeModuleResolver,
    isPure: ExpressionPurityChecker
): void {
    const passes = preparationPasses(preparations, function () {
        return JSON.stringify(modules.map(function (file) {
            return file.sourceFile.getFullText();
        }));
    });
    for (const pass of passes) {
        const hasImports = pass.some(function (preparation) {
            return preparation.sourceFile.getFirstDescendantByKind(SyntaxKind.ImportDeclaration) !== undefined;
        });
        const evaluateImport = hasImports
            ? createBundleConstantEvaluator(createModuleConstantSnapshot(modules, resolveModule), resolveModule)
            : undefined;
        for (const preparation of pass) {
            prepareResolvedRuntimeSource(preparation, evaluateImport, isPure);
        }
    }
}
