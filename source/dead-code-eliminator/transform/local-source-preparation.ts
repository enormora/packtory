import { preparationPasses, type SourcePreparation } from '../../source-transformation/source-preparation.ts';
import { hasDynamicScope } from '../dynamic-scope.ts';
import { runtimeSourceIsValid } from '../runtime-source-validity.ts';
import { specializeExpressions } from './expression-specialization.ts';
import { simplifyConstantControlFlow } from './constant-control-flow.ts';
import { reduceOptionalChains } from './optional-chain-reduction.ts';

export function prepareLocalRuntimeSource(preparation: SourcePreparation): void {
    if (
        hasDynamicScope(preparation.sourceFile) || preparation.sourceFile.getFullText() === '' ||
        !runtimeSourceIsValid(preparation.sourceFile)
    ) {
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
