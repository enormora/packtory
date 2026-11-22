import type { SourceFile } from 'ts-morph';
import { createSourcePreparation } from '../source-transformation/source-preparation.ts';
import { createExpressionPurityChecker } from '../dead-code-eliminator/pure-expression.ts';
import { prepareBundleSources } from '../dead-code-eliminator/transform/bundle-source-preparation.ts';

export function prepareStandaloneRuntimeSource(source: SourceFile): void {
    const resolveModule = function (): undefined {
        return undefined;
    };
    prepareBundleSources(
        [ createSourcePreparation(source) ],
        [ {
            sourceFile: source,
            targetFilePath: source.getBaseName(),
            moduleReferences: []
        } ],
        resolveModule,
        createExpressionPurityChecker(undefined, resolveModule)
    );
}
