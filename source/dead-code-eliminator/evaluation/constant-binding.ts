import {
    Node as TypeScriptMorphNode,
    SyntaxKind,
    VariableDeclarationKind,
    type Expression,
    type Identifier,
    type VariableDeclaration,
    type VariableStatement
} from 'ts-morph';
import { declarationOf } from './evaluation-context.ts';
import { evaluated, type EvaluatedValue } from './primitive-value.ts';

export type KnownConstants = ReadonlyMap<VariableDeclaration, EvaluatedValue>;

export function constantStatement(declaration: VariableDeclaration): VariableStatement | undefined {
    const list = declaration.getParentIfKind(SyntaxKind.VariableDeclarationList);
    const statement = list?.getParentIfKind(SyntaxKind.VariableStatement);
    return statement?.getDeclarationKind() === VariableDeclarationKind.Const && !statement.isAmbient()
        ? statement
        : undefined;
}

function sameActivation(declaration: VariableDeclaration, read: Expression): boolean {
    const declarationScope = declaration.getFirstAncestor(TypeScriptMorphNode.isFunctionLikeDeclaration);
    const readScope = read.getFirstAncestor(TypeScriptMorphNode.isFunctionLikeDeclaration);
    return declaration.getSourceFile() === read.getSourceFile() &&
        declarationScope === readScope;
}

export function constantDominatesRead(declaration: VariableDeclaration, read: Expression): boolean {
    const scope = constantStatement(declaration)?.getParent();
    if (!TypeScriptMorphNode.isSourceFile(scope) && !TypeScriptMorphNode.isBlock(scope)) {
        return false;
    }
    return sameActivation(declaration, read) && read.getStart() > declaration.getEnd() &&
        read.getAncestors().includes(scope);
}

function intrinsicUndefined(read: Identifier): boolean {
    return read.getText() === 'undefined' && read.getSymbolOrThrow().getDeclarations().length === 0;
}

function constantIsAvailable(
    declaration: VariableDeclaration,
    read: Identifier,
    evaluationRoot: Expression
): boolean {
    if (constantDominatesRead(declaration, read)) {
        return true;
    }
    return TypeScriptMorphNode.isSourceFile(constantStatement(declaration)?.getParent()) &&
        constantDominatesRead(declaration, evaluationRoot);
}

export function constantValueFor(
    read: Identifier,
    values: KnownConstants,
    evaluationRoot: Expression
): EvaluatedValue | undefined {
    if (intrinsicUndefined(read)) {
        return evaluated(undefined);
    }
    if (values.size === 0) {
        return undefined;
    }
    const declaration = declarationOf(read);
    if (!TypeScriptMorphNode.isVariableDeclaration(declaration)) {
        return undefined;
    }
    const value = values.get(declaration);
    return value !== undefined && constantIsAvailable(declaration, read, evaluationRoot) ? value : undefined;
}
