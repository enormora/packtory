import { Node as TypeScriptMorphNode, type ts } from 'ts-morph';
import { createSyntaxAnalysis, type SyntaxAnalysisResults } from './syntax-analysis.ts';

type TypeAncestry = WeakMap<ts.Node, boolean>;
type ReadParent = (node: TypeScriptMorphNode) => TypeScriptMorphNode | undefined;
type AncestryResult = {
    readonly pending: readonly TypeScriptMorphNode[];
    readonly result: boolean;
};

const typeAncestryResults: SyntaxAnalysisResults<TypeAncestry> = new WeakMap();

function createTypeAncestry(): TypeAncestry {
    return new WeakMap();
}

function* ancestorChain(node: TypeScriptMorphNode, parentFor: ReadParent): Iterable<TypeScriptMorphNode> {
    for (let parent = parentFor(node); parent !== undefined; parent = parentFor(parent)) {
        yield parent;
    }
}

function readTypeAncestry(node: TypeScriptMorphNode, parentFor: ReadParent, results: TypeAncestry): AncestryResult {
    const pending = [ node ];
    for (const parent of ancestorChain(node, parentFor)) {
        if (TypeScriptMorphNode.isTypeNode(parent)) {
            return { pending, result: true };
        }
        const found = results.get(parent.compilerNode);
        if (found !== undefined) {
            return { pending, result: found };
        }
        pending.push(parent);
    }
    return { pending, result: false };
}

export function createTypeAncestorAnalysis(
    parentFor: ReadParent,
    results: TypeAncestry
): (node: TypeScriptMorphNode) => boolean {
    return function (node) {
        const found = results.get(node.compilerNode);
        if (found !== undefined) {
            return found;
        }
        const ancestry = readTypeAncestry(node, parentFor, results);
        for (const ancestor of ancestry.pending) {
            results.set(ancestor.compilerNode, ancestry.result);
        }
        return ancestry.result;
    };
}

function readParent(node: TypeScriptMorphNode): TypeScriptMorphNode | undefined {
    return node.getParent();
}

export function hasTypeAncestor(node: TypeScriptMorphNode): boolean {
    const results = createSyntaxAnalysis(createTypeAncestry, typeAncestryResults)(node.getSourceFile());
    return createTypeAncestorAnalysis(readParent, results)(node);
}
