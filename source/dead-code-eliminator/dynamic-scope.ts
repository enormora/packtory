import { SyntaxKind, type SourceFile } from 'ts-morph';
import { unwrapExpression } from './expression-unwrapping.ts';

export function hasDynamicScope(sourceFile: SourceFile): boolean {
    return sourceFile.getDescendantsOfKind(SyntaxKind.WithStatement).length > 0 ||
        sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression).some(function (candidate) {
            return unwrapExpression(candidate.getExpression()).getText() === 'eval';
        });
}
