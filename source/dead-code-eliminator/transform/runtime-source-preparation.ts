import type { SourcePreparation } from '../../source-transformation/source-preparation.ts';
import type { PrimitiveEvaluator } from '../evaluation/constant-evaluation.ts';
import type { ExpressionPurityChecker } from '../imported-expression-origin.ts';
import { runtimeSourceIsValid } from '../runtime-source-validity.ts';
import { specializeImportedValues } from './imported-value-specialization.ts';
import { reduceObjectBindings } from './object-binding-reduction.ts';
import { removeUnusedValues } from './unused-values.ts';
import { prepareLocalRuntimeSource } from './local-source-preparation.ts';

export function prepareResolvedRuntimeSource(
    preparation: SourcePreparation,
    evaluateImport: PrimitiveEvaluator | undefined,
    isPure: ExpressionPurityChecker
): void {
    if (!runtimeSourceIsValid(preparation.sourceFile)) {
        return;
    }
    if (evaluateImport !== undefined) {
        specializeImportedValues(preparation, evaluateImport);
    }
    prepareLocalRuntimeSource(preparation);
    reduceObjectBindings(preparation);
    removeUnusedValues(preparation, isPure);
}
