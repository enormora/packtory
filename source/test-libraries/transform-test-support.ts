import assert from 'node:assert';
import type { SourceFile, Statement, VariableDeclaration } from 'ts-morph';
import { createProject } from './typescript-project.ts';

export function withSource(content: string): SourceFile {
    const project = createProject({ withFiles: [ { filePath: '/source.ts', content } ] });
    return project.getSourceFileOrThrow('/source.ts');
}

export function firstStatement(sourceFile: SourceFile): Statement {
    const [ statement ] = sourceFile.getStatements();
    assert.ok(statement !== undefined);
    return statement;
}

export function firstVariableDeclaration(sourceFile: SourceFile): VariableDeclaration {
    const [ variableStatement ] = sourceFile.getVariableStatements();
    assert.ok(variableStatement !== undefined);
    const [ declaration ] = variableStatement.getDeclarations();
    assert.ok(declaration !== undefined);
    return declaration;
}
