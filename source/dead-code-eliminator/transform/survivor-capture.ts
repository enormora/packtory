import { Node as TsMorphNode, type Statement, type VariableDeclaration, type VariableStatement } from 'ts-morph';
import { variableDeclarationSurvives } from '../variable-declaration-bindings.ts';
import { isNamedDeclaration, type NamedStatement } from './named-declaration-kinds.ts';

export type Survivor = {
    readonly node: Statement | VariableDeclaration;
    readonly originalStart: number;
    readonly originalEnd: number;
};

function captureSurvivor(node: Statement | VariableDeclaration): Survivor {
    return { node, originalStart: node.getStart(), originalEnd: node.getEnd() };
}

function captureNamedDeclarationSurvivor(
    statement: NamedStatement,
    survivingNames: ReadonlySet<string>
): readonly Survivor[] {
    const name = statement.getName();
    if (name === undefined || survivingNames.has(name)) {
        return [captureSurvivor(statement)];
    }
    return [];
}

function captureVariableStatementSurvivors(
    statement: VariableStatement,
    survivingNames: ReadonlySet<string>
): readonly Survivor[] {
    const declarators = statement.getDeclarations();
    const survivingDeclarators = declarators.filter((declarator) => {
        return variableDeclarationSurvives(declarator, survivingNames);
    });
    if (survivingDeclarators.length === declarators.length) {
        return [captureSurvivor(statement)];
    }
    return survivingDeclarators.map(captureSurvivor);
}

export function captureSurvivorsForStatement(
    statement: Statement,
    survivingNames: ReadonlySet<string>
): readonly Survivor[] {
    if (isNamedDeclaration(statement)) {
        return captureNamedDeclarationSurvivor(statement, survivingNames);
    }
    if (TsMorphNode.isVariableStatement(statement)) {
        return captureVariableStatementSurvivors(statement, survivingNames);
    }
    return [captureSurvivor(statement)];
}
