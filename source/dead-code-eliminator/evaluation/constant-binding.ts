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
    const list = declaration.getParentIfKindOrThrow(SyntaxKind.VariableDeclarationList);
    const statement = list.getParentIfKind(SyntaxKind.VariableStatement);
    return statement?.getDeclarationKind() === VariableDeclarationKind.Const && !statement.isAmbient()
        ? statement
        : undefined;
}

function sameActivation(declaration: VariableDeclaration, read: Expression): boolean {
    const declarationScope = declaration.getFirstAncestor(TypeScriptMorphNode.isFunctionLikeDeclaration);
    const readScope = read.getFirstAncestor(TypeScriptMorphNode.isFunctionLikeDeclaration);
    return declarationScope === readScope;
}

function constantDeclarationScope(declaration: VariableDeclaration): TypeScriptMorphNode | undefined {
    const scope = constantStatement(declaration)?.getParent();
    return TypeScriptMorphNode.isSourceFile(scope) || TypeScriptMorphNode.isBlock(scope) ? scope : undefined;
}

export function constantDominatesRead(declaration: VariableDeclaration, read: Expression): boolean {
    const scope = constantDeclarationScope(declaration);
    const ancestors = read.getAncestors();
    return scope !== undefined && sameActivation(declaration, read) &&
        read.getStart() > declaration.getStart() && !ancestors.includes(declaration) && ancestors.includes(scope);
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
    const declaration = declarationOf(read)?.asKind(SyntaxKind.VariableDeclaration);
    if (declaration === undefined) {
        return undefined;
    }
    return constantIsAvailable(declaration, read, evaluationRoot) ? values.get(declaration) : undefined;
}
