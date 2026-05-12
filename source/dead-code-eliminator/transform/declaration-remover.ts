import {
    Node as TsMorphNode,
    SyntaxKind,
    type SourceFile,
    type Statement,
    type VariableDeclaration,
    type VariableStatement
} from 'ts-morph';

export type RemovalPlan = {
    readonly survivingNames: ReadonlySet<string>;
};

export type PositionAtom = {
    readonly originalStart: number;
    readonly originalEnd: number;
    readonly newStart: number;
};

export type RemovalResult = {
    readonly mutated: boolean;
    readonly atoms: readonly PositionAtom[];
};

type Survivor = {
    readonly node: Statement | VariableDeclaration;
    readonly originalStart: number;
    readonly originalEnd: number;
};

const namedDeclarationKinds: ReadonlySet<SyntaxKind> = new Set([
    SyntaxKind.FunctionDeclaration,
    SyntaxKind.ClassDeclaration,
    SyntaxKind.InterfaceDeclaration,
    SyntaxKind.TypeAliasDeclaration,
    SyntaxKind.EnumDeclaration,
    SyntaxKind.ModuleDeclaration
]);

type NamedStatement = Statement & { getName: () => string | undefined };

function isNamedDeclaration(statement: Statement): statement is NamedStatement {
    return namedDeclarationKinds.has(statement.getKind());
}

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
        return survivingNames.has(declarator.getName());
    });
    if (survivingDeclarators.length === declarators.length) {
        return [captureSurvivor(statement)];
    }
    return survivingDeclarators.map(captureSurvivor);
}

function captureSurvivorsForStatement(statement: Statement, survivingNames: ReadonlySet<string>): readonly Survivor[] {
    if (isNamedDeclaration(statement)) {
        return captureNamedDeclarationSurvivor(statement, survivingNames);
    }
    if (TsMorphNode.isVariableStatement(statement)) {
        return captureVariableStatementSurvivors(statement, survivingNames);
    }
    return [captureSurvivor(statement)];
}

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
        if (!survivingNames.has(declarator.getName())) {
            declarator.remove();
            mutated = true;
        }
    }
    return mutated;
}

function processStatement(statement: Statement, survivingNames: ReadonlySet<string>): boolean {
    if (processNamedDeclaration(statement, survivingNames)) {
        return true;
    }
    return processVariableStatement(statement, survivingNames);
}

export function applyRemovalPlan(sourceFile: SourceFile, plan: RemovalPlan): RemovalResult {
    const statements = sourceFile.getStatements();
    const survivors = statements.flatMap((statement) => {
        return captureSurvivorsForStatement(statement, plan.survivingNames);
    });
    let mutated = false;
    for (const statement of statements) {
        if (processStatement(statement, plan.survivingNames)) {
            mutated = true;
        }
    }
    const atoms = survivors.map((survivor) => {
        return {
            originalStart: survivor.originalStart,
            originalEnd: survivor.originalEnd,
            newStart: survivor.node.getStart()
        };
    });
    return { mutated, atoms };
}
