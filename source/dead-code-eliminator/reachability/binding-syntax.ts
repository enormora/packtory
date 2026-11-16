import {
    SyntaxKind,
    type Identifier,
    type CallExpression,
    type ShorthandPropertyAssignment,
    type Node as TypeScriptMorphNode
} from 'ts-morph';
import { createSyntaxAnalysis, type SyntaxAnalysisResults } from '../../source-transformation/syntax-analysis.ts';

export type BindingSyntaxNode = Pick<TypeScriptMorphNode, 'compilerNode' | 'getDescendantsOfKind' | 'getSourceFile'>;
type BindingSyntax = {
    readonly identifiers: readonly Identifier[];
    readonly calls: readonly CallExpression[];
    readonly shorthands: readonly ShorthandPropertyAssignment[];
};

type BindingSyntaxCache = WeakMap<BindingSyntaxNode['compilerNode'], BindingSyntax>;
const bindingSyntaxResults: SyntaxAnalysisResults<BindingSyntaxCache> = new WeakMap();

function createBindingSyntaxCache(): BindingSyntaxCache {
    return new WeakMap();
}

function collectBindingSyntax(node: BindingSyntaxNode): BindingSyntax {
    return {
        identifiers: node.getDescendantsOfKind(SyntaxKind.Identifier),
        calls: node.getDescendantsOfKind(SyntaxKind.CallExpression),
        shorthands: node.getDescendantsOfKind(SyntaxKind.ShorthandPropertyAssignment)
    };
}

export function readBindingSyntax(node: BindingSyntaxNode): BindingSyntax {
    const results = createSyntaxAnalysis(createBindingSyntaxCache, bindingSyntaxResults)(node.getSourceFile());
    const syntax = results.get(node.compilerNode) ?? collectBindingSyntax(node);
    results.set(node.compilerNode, syntax);
    return syntax;
}
