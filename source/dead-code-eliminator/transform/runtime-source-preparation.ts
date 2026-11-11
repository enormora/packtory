import { preparationPasses, type SourcePreparation } from '../../source-transformation/source-preparation.ts';
import type { PrimitiveEvaluator } from '../evaluation/constant-evaluation.ts';
import type { ExpressionPurityChecker } from '../imported-expression-origin.ts';
import { hasDynamicScope } from '../dynamic-scope.ts';
import { specializeExpressions } from './expression-specialization.ts';
import { simplifyConstantControlFlow } from './constant-control-flow.ts';
import { reduceOptionalChains } from './optional-chain-reduction.ts';
import { specializeImportedValues } from './imported-value-specialization.ts';
import { reduceObjectBindings } from './object-binding-reduction.ts';
import { removeUnusedValues } from './unused-values.ts';

export function prepareInitialRuntimeSource(preparation: SourcePreparation): void {
    if (hasDynamicScope(preparation.sourceFile) || preparation.sourceFile.getFullText() === '') {
        return;
    }
    const passes = preparationPasses(preparation, function () {
        return preparation.sourceFile.getFullText();
    });
    for (const pass of passes) {
        reduceOptionalChains(pass);
        simplifyConstantControlFlow(pass);
        specializeExpressions(pass);
    }
}

export function prepareResolvedRuntimeSource(
    preparation: SourcePreparation,
    evaluateImport: PrimitiveEvaluator,
    isPure: ExpressionPurityChecker
): void {
    specializeImportedValues(preparation, evaluateImport);
    prepareInitialRuntimeSource(preparation);
    reduceObjectBindings(preparation);
    removeUnusedValues(preparation, isPure);
}
