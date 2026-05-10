import { Node as TsMorphNode, SyntaxKind, type SourceFile, type Statement } from 'ts-morph';

export type RemovalPlan = {
    readonly survivingNames: ReadonlySet<string>;
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

export function applyRemovalPlan(sourceFile: SourceFile, plan: RemovalPlan): boolean {
    let mutated = false;
    for (const statement of sourceFile.getStatements()) {
        if (processStatement(statement, plan.survivingNames)) {
            mutated = true;
        }
    }
    return mutated;
}
