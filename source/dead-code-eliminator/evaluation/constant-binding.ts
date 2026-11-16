import {
    Node as TypeScriptMorphNode,
    SyntaxKind,
    VariableDeclarationKind,
    type Expression,
    type Identifier,
    type ParameterDeclaration,
    type VariableDeclaration,
    type VariableStatement
} from 'ts-morph';
import { isIncludedIn } from 'remeda';
import { declarationOf } from './evaluation-context.ts';
import { evaluated, type EvaluatedValue } from './primitive-value.ts';

export type KnownConstants = Pick<ReadonlyMap<VariableDeclaration, EvaluatedValue>, 'get'>;

function lexicalStatement(declaration: VariableDeclaration): VariableStatement | undefined {
    const statement = declaration.getVariableStatement();
    if (
        statement === undefined || statement.isAmbient() ||
        ![ VariableDeclarationKind.Const, VariableDeclarationKind.Let ].includes(statement.getDeclarationKind())
    ) {
        return undefined;
    }
    return statement;
}

export function constantStatement(declaration: VariableDeclaration): VariableStatement | undefined {
    const statement = lexicalStatement(declaration);
    return statement?.getDeclarationKind() === VariableDeclarationKind.Const
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

export function createConstantBindingValues(
    declarations: readonly VariableDeclaration[],
    evaluate: (expression: Expression) => EvaluatedValue | undefined
): KnownConstants {
    const values = new Map<VariableDeclaration, EvaluatedValue | undefined>();
    const pending = declarations.values();
    function initializeThrough(declaration: VariableDeclaration): void {
        for (const candidate of pending) {
            values.set(candidate, undefined);
            const initializer = constantInitializer(candidate);
            values.set(candidate, initializer === undefined ? undefined : evaluate(initializer));
            if (candidate === declaration) {
                break;
            }
        }
    }
    return {
        get(declaration) {
            if (!values.has(declaration)) {
                initializeThrough(declaration);
            }
            return values.get(declaration);
        }
    };
}

function sameActivation(declaration: ParameterDeclaration | VariableDeclaration, read: TypeScriptMorphNode): boolean {
    const declarationScope = declaration.getFirstAncestor(TypeScriptMorphNode.isFunctionLikeDeclaration);
    const readScope = read.getFirstAncestor(TypeScriptMorphNode.isFunctionLikeDeclaration);
    return declarationScope === readScope;
}

function lexicalDeclarationScope(declaration: VariableDeclaration): TypeScriptMorphNode | undefined {
    const scope = lexicalStatement(declaration)?.getParent();
    return TypeScriptMorphNode.isSourceFile(scope) || TypeScriptMorphNode.isBlock(scope) ? scope : undefined;
}

function lexicalBindingDominatesRead(declaration: VariableDeclaration, read: TypeScriptMorphNode): boolean {
    const scope = lexicalDeclarationScope(declaration);
    const ancestors = read.getAncestors();
    return sameActivation(declaration, read) && read.getStart() > declaration.getEnd() &&
        isIncludedIn(scope, ancestors);
}

export function constantDominatesRead(declaration: VariableDeclaration, read: TypeScriptMorphNode): boolean {
    return constantStatement(declaration) !== undefined && lexicalBindingDominatesRead(declaration, read);
}

function parameterIsInitializedAtRead(declaration: ParameterDeclaration, read: Expression): boolean {
    const initializingParameter = read.getFirstAncestorByKind(SyntaxKind.Parameter);
    return sameActivation(declaration, read) &&
        (initializingParameter === undefined || declaration.getChildIndex() < initializingParameter.getChildIndex());
}

export function localReadHasNoEffects(expression: Expression): boolean {
    if (!TypeScriptMorphNode.isIdentifier(expression)) {
        return false;
    }
    const declaration = declarationOf(expression);
    if (TypeScriptMorphNode.isParameterDeclaration(declaration)) {
        return parameterIsInitializedAtRead(declaration, expression);
    }
    return TypeScriptMorphNode.isVariableDeclaration(declaration) &&
        lexicalBindingDominatesRead(declaration, expression);
}

export function intrinsicUndefined(read: Identifier): boolean {
    return read.getText() === 'undefined' && read.getSymbolOrThrow().getDeclarations().length === 0;
}

function constantIsAvailable(
    declaration: VariableDeclaration,
    read: Identifier,
    evaluationRoot: TypeScriptMorphNode
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
    evaluationRoot: TypeScriptMorphNode
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
