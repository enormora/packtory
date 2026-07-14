import { Node as TsMorphNode, type Statement } from 'ts-morph';
import { variableDeclarationSurvives } from '../variable-declaration-bindings.ts';
import { isNamedDeclaration } from './named-declaration-kinds.ts';

function processNamedDeclaration(statement: Statement, survivingNames: ReadonlySet<string>): boolean {
    if (!isNamedDeclaration(statement)) {
        return false;
    }
    const name = statement.getName();
    if (name === undefined || survivingNames.has(name)) {
        return false;
    }
    statement.remove();
    return true;
}

function processVariableStatement(statement: Statement, survivingNames: ReadonlySet<string>): boolean {
    if (!TsMorphNode.isVariableStatement(statement)) {
        return false;
    }
    const removedDeclarators = statement.getDeclarations().filter(function (declarator) {
        return !variableDeclarationSurvives(declarator, survivingNames);
    });
    for (const declarator of removedDeclarators) {
        declarator.remove();
    }
    return removedDeclarators.length > 0;
}

export function processStatement(statement: Statement, survivingNames: ReadonlySet<string>): boolean {
    if (processNamedDeclaration(statement, survivingNames)) {
        return true;
    }
    return processVariableStatement(statement, survivingNames);
}
