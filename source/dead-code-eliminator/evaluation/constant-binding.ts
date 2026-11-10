import {
    Node as TypeScriptMorphNode,
    SyntaxKind,
    VariableDeclarationKind,
    type Expression,
    type Identifier,
    type VariableDeclaration,
    type VariableStatement
} from 'ts-morph';
import { isIncludedIn } from 'remeda';
import { declarationOf } from './evaluation-context.ts';
import { evaluated, type EvaluatedValue } from './primitive-value.ts';

export type KnownConstants = ReadonlyMap<VariableDeclaration, EvaluatedValue>;

export function constantStatement(declaration: VariableDeclaration): VariableStatement | undefined {
    const statement = declaration.getVariableStatement();
    return statement?.getDeclarationKind() === VariableDeclarationKind.Const && !statement.isAmbient()
        ? statement
        : undefined;
}

export function constantInitializer(declaration: VariableDeclaration): Expression | undefined {
    const name = declaration.getNameNode();
    if (!TypeScriptMorphNode.isIdentifier(name)) {
        return undefined;
    }
    return constantStatement(declaration) === undefined ? undefined : declaration.getInitializer();
}

export function* evaluateConstantBindings(
    declarations: readonly VariableDeclaration[],
    evaluate: (expression: Expression) => EvaluatedValue | undefined
): Generator<readonly [VariableDeclaration, EvaluatedValue]> {
    for (const declaration of declarations) {
        const initializer = constantInitializer(declaration);
        const value = initializer === undefined ? undefined : evaluate(initializer);
        if (value !== undefined) {
            yield [ declaration, value ];
        }
    }
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
    return sameActivation(declaration, read) && read.getStart() > declaration.getEnd() &&
        isIncludedIn(scope, ancestors);
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
