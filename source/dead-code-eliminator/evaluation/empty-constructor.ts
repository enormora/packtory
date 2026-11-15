import {
    Node as TypeScriptMorphNode,
    type ConstructorDeclaration,
    type FunctionDeclaration,
    type FunctionExpression,
    type ParameterDeclaration,
    type Statement
} from 'ts-morph';
import type { LocalFunction } from './call-target.ts';

function parameterHasNoEffects(parameter: ParameterDeclaration): boolean {
    return TypeScriptMorphNode.isIdentifier(parameter.getNameNode()) &&
        parameter.getInitializer() === undefined && !parameter.isRestParameter() &&
        !parameter.isParameterProperty() && parameter.getDecorators().length === 0;
}

function statementHasNoEffects(statement: Statement): boolean {
    if (TypeScriptMorphNode.isReturnStatement(statement)) {
        return statement.getExpression() === undefined;
    }
    return TypeScriptMorphNode.isEmptyStatement(statement) ||
        TypeScriptMorphNode.isBlock(statement) && statement.getStatements().every(statementHasNoEffects);
}

export function constructorBodyIsEmpty(
    target: ConstructorDeclaration | FunctionDeclaration | FunctionExpression
): boolean {
    const body = target.getBody();
    return TypeScriptMorphNode.isBlock(body) && target.getParameters().every(parameterHasNoEffects) &&
        body.getStatements().every(statementHasNoEffects);
}

export function functionConstructionIsPure(target: LocalFunction): boolean {
    return !TypeScriptMorphNode.isArrowFunction(target) && !target.isAsync() && !target.isGenerator() &&
        constructorBodyIsEmpty(target);
}
