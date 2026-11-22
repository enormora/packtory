import { preparationPasses, type SourcePreparation } from '../../source-transformation/source-preparation.ts';
import { hasDynamicScope } from '../dynamic-scope.ts';
import { runtimeSourceIsValid } from '../runtime-source-validity.ts';
import { specializeExpressions } from './expression-specialization.ts';
import { simplifyConstantControlFlow } from './constant-control-flow.ts';
import { reduceOptionalChains } from './optional-chain-reduction.ts';

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

export function prepareLocalRuntimeSource(preparation: SourcePreparation): void {
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
