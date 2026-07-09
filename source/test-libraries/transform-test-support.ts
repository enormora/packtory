import type { SourceFile, Statement, VariableDeclaration } from 'ts-morph';
import { assertDefined } from './deep-subset-assertion.ts';
import { createProject } from './typescript-project.ts';

export function withSource(content: string): SourceFile {
    const project = createProject({ withFiles: [ { filePath: '/source.ts', content } ] });
    return project.getSourceFileOrThrow('/source.ts');
}

export function firstStatement(sourceFile: SourceFile): Statement {
    const [ statement ] = sourceFile.getStatements();
    assertDefined(statement);
    return statement;
}

export function firstVariableDeclaration(sourceFile: SourceFile): VariableDeclaration {
    const [ variableStatement ] = sourceFile.getVariableStatements();
    assertDefined(variableStatement);
    const [ declaration ] = variableStatement.getDeclarations();
    assertDefined(declaration);
    return declaration;
}
