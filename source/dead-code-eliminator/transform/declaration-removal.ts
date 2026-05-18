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
    let mutated = false;
    for (const declarator of statement.getDeclarations()) {
        if (!variableDeclarationSurvives(declarator, survivingNames)) {
            declarator.remove();
            mutated = true;
        }
    }
    return mutated;
}

export function processStatement(statement: Statement, survivingNames: ReadonlySet<string>): boolean {
    if (processNamedDeclaration(statement, survivingNames)) {
        return true;
    }
    return processVariableStatement(statement, survivingNames);
}
