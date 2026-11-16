import { SyntaxKind, type SourceFile } from 'ts-morph';
import { createSyntaxAnalysis } from '../source-transformation/syntax-analysis.ts';
import { unwrapExpression } from './expression-unwrapping.ts';

function detectDynamicScope(sourceFile: SourceFile): boolean {
    return sourceFile.getDescendantsOfKind(SyntaxKind.WithStatement).length > 0 ||
        sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression).some(function (candidate) {
            return unwrapExpression(candidate.getExpression()).getText() === 'eval';
        });
}

export const hasDynamicScope = createSyntaxAnalysis(detectDynamicScope);
