import { Node as TypeScriptMorphNode, SyntaxKind, type CallExpression, type SourceFile } from 'ts-morph';
import { createSyntaxAnalysis, type SyntaxAnalysisResults } from '../source-transformation/syntax-analysis.ts';
import { unwrapExpression } from './expression-unwrapping.ts';

export function callsEvalIdentifier(call: CallExpression): boolean {
    const target = unwrapExpression(call.getExpression());
    return TypeScriptMorphNode.isIdentifier(target) && target.compilerNode.text === 'eval';
}

function detectDynamicScope(sourceFile: SourceFile): boolean {
    return sourceFile.getDescendantsOfKind(SyntaxKind.WithStatement).length > 0 ||
        sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression).some(callsEvalIdentifier);
}

const dynamicScopeResults: SyntaxAnalysisResults<boolean> = new WeakMap();

export function hasDynamicScope(source: SourceFile): boolean {
    return createSyntaxAnalysis(detectDynamicScope, dynamicScopeResults)(source);
}
