import assert from 'node:assert';
import type { SourceFile, Statement, VariableDeclaration } from 'ts-morph';
import { createProject } from './typescript-project.ts';

export function withSource(content: string): SourceFile {
    const project = createProject({ withFiles: [ { filePath: '/source.ts', content } ] });
    return project.getSourceFileOrThrow('/source.ts');
}

export function firstStatement(sourceFile: SourceFile): Statement {
    const [ statement ] = sourceFile.getStatements();
    assert.notStrictEqual(statement, undefined);
    return statement;
}

export function firstVariableDeclaration(sourceFile: SourceFile): VariableDeclaration {
    const [ variableStatement ] = sourceFile.getVariableStatements();
    assert.notStrictEqual(variableStatement, undefined);
    const [ declaration ] = variableStatement.getDeclarations();
    assert.notStrictEqual(declaration, undefined);
    return declaration;
}
