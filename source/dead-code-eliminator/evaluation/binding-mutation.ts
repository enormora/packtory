import { Node as TypeScriptMorphNode, SyntaxKind, type Expression, type Identifier, type SourceFile } from 'ts-morph';
import { isAssignmentOperator } from '../assignment-operator.ts';
import { createSyntaxAnalysis, type SyntaxAnalysisResults } from '../../source-transformation/syntax-analysis.ts';
import { unwrapExpression } from '../expression-unwrapping.ts';

function rootMutationIdentifier(expression: Expression | undefined): Identifier | undefined {
    const unwrapped = unwrapExpression(expression);
    if (TypeScriptMorphNode.isIdentifier(unwrapped)) {
        return unwrapped;
    }
    const isMemberAccess = TypeScriptMorphNode.isPropertyAccessExpression(unwrapped) ||
        TypeScriptMorphNode.isElementAccessExpression(unwrapped);
    return isMemberAccess ? rootMutationIdentifier(unwrapped.getExpression()) : undefined;
}

function updatedOperand(node: TypeScriptMorphNode): Expression | undefined {
    if (!TypeScriptMorphNode.isPrefixUnaryExpression(node) && !TypeScriptMorphNode.isPostfixUnaryExpression(node)) {
        return undefined;
    }
    return [ SyntaxKind.PlusPlusToken, SyntaxKind.MinusMinusToken ].includes(node.getOperatorToken())
        ? node.getOperand()
        : undefined;
}

function mutatedTarget(node: TypeScriptMorphNode): Expression | undefined {
    if (TypeScriptMorphNode.isBinaryExpression(node)) {
        return isAssignmentOperator(node.getOperatorToken().getKind()) ? node.getLeft() : undefined;
    }
    return updatedOperand(node);
}

function collectMutatedNames(source: SourceFile): ReadonlySet<string | undefined> {
    return new Set(
        source.getDescendants().map(function (node) {
            return rootMutationIdentifier(mutatedTarget(node))?.getText();
        })
    );
}

const mutatedNameResults: SyntaxAnalysisResults<ReadonlySet<string | undefined>> = new WeakMap();

export function bindingIsMutated(name: Identifier): boolean {
    return createSyntaxAnalysis(collectMutatedNames, mutatedNameResults)(name.getSourceFile()).has(name.getText());
}
