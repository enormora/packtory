import { Node as TypeScriptMorphNode, SyntaxKind, type Node as TypeScriptMorphNodeType } from 'ts-morph';

function containsWriteTarget(parent: TypeScriptMorphNodeType): boolean {
    return [
        SyntaxKind.ParenthesizedExpression,
        SyntaxKind.AsExpression,
        SyntaxKind.TypeAssertionExpression,
        SyntaxKind.SatisfiesExpression,
        SyntaxKind.NonNullExpression,
        SyntaxKind.ArrayLiteralExpression,
        SyntaxKind.ObjectLiteralExpression,
        SyntaxKind.SpreadElement,
        SyntaxKind.SpreadAssignment
    ]
        .includes(parent.getKind());
}

function enclosingWriteTarget(node: TypeScriptMorphNodeType): TypeScriptMorphNodeType | undefined {
    const parent = node.getParentOrThrow();
    if (containsWriteTarget(parent)) {
        return parent;
    }
    if (!TypeScriptMorphNode.isPropertyAssignment(parent)) {
        return undefined;
    }
    const initializesProperty = parent.getInitializerOrThrow().getStart() === node.getStart();
    return initializesProperty ? parent : undefined;
}

function assignmentWritesNode(node: TypeScriptMorphNodeType): boolean | undefined {
    const parent = node.getParent();
    if (TypeScriptMorphNode.isBinaryExpression(parent)) {
        const operator = parent.getOperatorToken().getKind();
        return parent.getLeft() === node && operator >= SyntaxKind.FirstAssignment &&
            operator <= SyntaxKind.LastAssignment;
    }
    if (TypeScriptMorphNode.isForInStatement(parent) || TypeScriptMorphNode.isForOfStatement(parent)) {
        return parent.getInitializer() === node;
    }
    return undefined;
}

export function expressionIsWriteTarget(node: TypeScriptMorphNodeType): boolean {
    const target = node.getAncestors().reduce(function (current, parent) {
        return enclosingWriteTarget(current) === parent ? parent : current;
    }, node);
    const assignment = assignmentWritesNode(target);
    if (assignment !== undefined) {
        return assignment;
    }
    const parent = target.getParent();
    return TypeScriptMorphNode.isPrefixUnaryExpression(parent) || TypeScriptMorphNode.isPostfixUnaryExpression(parent)
        ? [ SyntaxKind.PlusPlusToken, SyntaxKind.MinusMinusToken ].includes(parent.getOperatorToken())
        : false;
}
