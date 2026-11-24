import { Node as TypeScriptMorphNode, SyntaxKind, type Expression, type Identifier, type SourceFile } from 'ts-morph';
import { isAssignmentOperator } from '../assignment-operator.ts';
import { createSyntaxAnalysis, type SyntaxAnalysisResults } from '../../source-transformation/syntax-analysis.ts';
import { unwrapExpression } from '../expression-unwrapping.ts';

type MutationRecord = { readonly name: string; readonly start: number; };

function rootMutationIdentifier(expression: Expression): Identifier | undefined {
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

function collectMutationRecords(source: SourceFile): readonly MutationRecord[] {
    return source.getDescendants().flatMap(function (node) {
        const target = mutatedTarget(node);
        const identifier = target === undefined ? undefined : rootMutationIdentifier(target);
        return identifier === undefined ? [] : { name: identifier.getText(), start: node.getStart() };
    });
}

const mutationRecordResults: SyntaxAnalysisResults<readonly MutationRecord[]> = new WeakMap();

export function bindingIsMutatedBeforeRead(
    declarationName: Identifier,
    declarationEnd: number,
    read: Identifier
): boolean {
    const records = createSyntaxAnalysis(collectMutationRecords, mutationRecordResults)(read.getSourceFile());
    return records.some(function (record) {
        return record.name === declarationName.getText() && record.start > declarationEnd &&
            read.getStart() > record.start;
    });
}
