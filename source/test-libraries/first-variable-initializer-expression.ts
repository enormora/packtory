import { SyntaxKind, type Expression } from 'ts-morph';
import { createProject } from './typescript-project.ts';

export function firstVariableInitializerExpression(content: string): Expression {
    const project = createProject({ withFiles: [ { filePath: 'index.ts', content } ] });
    const sourceFile = project.getSourceFileOrThrow('index.ts');

    for (const statement of sourceFile.getChildrenOfKind(SyntaxKind.VariableStatement)) {
        const initializer = statement.getDeclarations()[0]?.getInitializer();
        if (initializer !== undefined) {
            return initializer;
        }
    }

    throw new Error('no variable initializer found in test source');
}
