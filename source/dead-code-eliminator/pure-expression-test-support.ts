import type { Expression } from 'ts-morph';
import { createProject } from '../test-libraries/typescript-project.ts';

export type ProjectFile = { readonly content: string; readonly filePath: string; };

export function initializerFromProjectFiles(files: readonly ProjectFile[]): Expression {
    const project = createProject({ withFiles: files });
    return project
        .getSourceFileOrThrow('/project/src/index.ts')
        .getVariableDeclarationOrThrow('schema')
        .getInitializerOrThrow();
}

export function variableInitializer(content: string, name: string): Expression {
    const project = createProject({ withFiles: [ { filePath: 'index.ts', content } ] });
    return project
        .getSourceFileOrThrow('index.ts')
        .getVariableDeclarationOrThrow(name)
        .getInitializerOrThrow();
}

export function schemaPackageFile(content: string): ProjectFile {
    return { filePath: '/project/node_modules/schema-lib/index.js', content };
}

export function schemaPackageManifest(): ProjectFile {
    return {
        filePath: '/project/node_modules/schema-lib/package.json',
        content: '{"name":"schema-lib","type":"module","exports":"./index.js"}'
    };
}

export function expressionWithSchemaPackage(content: string, packageContent: string): Expression {
    return initializerFromProjectFiles([
        { filePath: '/project/src/index.ts', content },
        schemaPackageManifest(),
        schemaPackageFile(packageContent)
    ]);
}
