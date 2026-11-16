import { preparationPasses, type SourcePreparation } from '../../source-transformation/source-preparation.ts';
import type { PrimitiveEvaluator } from '../evaluation/constant-evaluation.ts';
import type { ExpressionPurityChecker } from '../imported-expression-origin.ts';
import { hasDynamicScope } from '../dynamic-scope.ts';
import { runtimeSourceIsValid } from '../runtime-source-validity.ts';
import { specializeExpressions } from './expression-specialization.ts';
import { simplifyConstantControlFlow } from './constant-control-flow.ts';
import { reduceOptionalChains } from './optional-chain-reduction.ts';
import { specializeImportedValues } from './imported-value-specialization.ts';
import { reduceObjectBindings } from './object-binding-reduction.ts';
// eslint-disable-next-line import/max-dependencies -- Runtime preparation composes the source passes and syntax validation.
import { removeUnusedValues } from './unused-values.ts';

const stableSources = new WeakSet<SourcePreparation['sourceFile']['compilerNode']>();

function needsInitialPreparation(preparation: SourcePreparation): boolean {
    const { sourceFile } = preparation;
    return !stableSources.has(sourceFile.compilerNode) && !hasDynamicScope(sourceFile) &&
        sourceFile.getFullText() !== '' && runtimeSourceIsValid(sourceFile);
}

function prepareLocalSyntax(preparation: SourcePreparation): void {
    reduceOptionalChains(preparation);
    simplifyConstantControlFlow(preparation);
    specializeExpressions(preparation);
}

export function prepareInitialRuntimeSource(preparation: SourcePreparation): void {
    if (!needsInitialPreparation(preparation)) {
        return;
    }
    const passes = preparationPasses(preparation, function () {
        return preparation.sourceFile.getFullText();
    });
    for (const pass of passes) {
        const before = pass.sourceFile.getFullText();
        prepareLocalSyntax(pass);
        if (pass.sourceFile.getFullText() === before) {
            stableSources.add(pass.sourceFile.compilerNode);
            return;
        }
    }
}

export function prepareResolvedRuntimeSource(
    preparation: SourcePreparation,
    evaluateImport: PrimitiveEvaluator,
    isPure: ExpressionPurityChecker
): void {
    if (!runtimeSourceIsValid(preparation.sourceFile)) {
        return;
    }
    specializeImportedValues(preparation, evaluateImport);
    prepareInitialRuntimeSource(preparation);
    reduceObjectBindings(preparation);
    removeUnusedValues(preparation, isPure);
}
