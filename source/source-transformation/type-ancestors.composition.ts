import type { Node as TypeScriptMorphNode } from 'ts-morph';
import { createSyntaxAnalysis, type SyntaxAnalysisResults } from './syntax-analysis.ts';
import { createTypeAncestorAnalysis, type TypeAncestry } from './type-ancestors.ts';

const typeAncestryResults: SyntaxAnalysisResults<TypeAncestry> = new WeakMap();

function createTypeAncestry(): TypeAncestry {
    return new WeakMap();
}

function readParent(node: TypeScriptMorphNode): TypeScriptMorphNode | undefined {
    return node.getParent();
}

export function hasTypeAncestor(node: TypeScriptMorphNode): boolean {
    const results = createSyntaxAnalysis(createTypeAncestry, typeAncestryResults)(node.getSourceFile());
    return createTypeAncestorAnalysis(readParent, results)(node);
}
