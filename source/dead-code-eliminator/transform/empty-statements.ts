import {
    Node as TypeScriptMorphNode,
    SyntaxKind,
    type EmptyStatement,
    type Statement,
    type SourceFile
} from 'ts-morph';

function isStringStatement(statement: Statement | undefined): boolean {
    return TypeScriptMorphNode.isExpressionStatement(statement) &&
        TypeScriptMorphNode.isStringLiteral(statement.getExpression());
}

function endsDirectivePrologue(statement: Statement): boolean {
    return !TypeScriptMorphNode.isEmptyStatement(statement) && !isStringStatement(statement);
}

function emptyStatementCanDisappear(statement: EmptyStatement): boolean {
    const parent = statement.getParent();
    if (!TypeScriptMorphNode.isStatemented(parent)) {
        return false;
    }
    const siblings = parent.getStatements();
    const position = siblings.indexOf(statement);
    const following = siblings.slice(position + 1).find(function (candidate) {
        return !TypeScriptMorphNode.isEmptyStatement(candidate);
    });
    return !isStringStatement(following) || siblings.slice(0, position).some(endsDirectivePrologue);
}

export function removeRedundantEmptyStatements(sourceFile: SourceFile): void {
    for (const statement of sourceFile.getDescendantsOfKind(SyntaxKind.EmptyStatement)) {
        if (emptyStatementCanDisappear(statement)) {
            statement.remove();
        }
    }
}
