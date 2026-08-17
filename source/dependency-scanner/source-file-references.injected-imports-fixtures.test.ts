import assert from 'node:assert';
import type { Project } from 'ts-morph';
import { createProject } from '../test-libraries/typescript-project.ts';
import { getReferencedModules } from './source-file-references.ts';

const packageJsonPath = '/package.json';

type DirectInjectedLoaderProjectInput = {
    readonly callSiteLoaderExpression: string;
    readonly dependencyCallExpression: string;
};

export function createDirectInjectedLoaderProject(input: DirectInjectedLoaderProjectInput): Project {
    return createProject({
        withFiles: [
            {
                filePath: 'main.ts',
                content: [
                    'import { foo } from "./a";',
                    `await foo(${input.callSiteLoaderExpression});`
                ]
                    .join('\n')
            },
            {
                filePath: 'a.ts',
                content: `export async function foo(load) { return await ${input.dependencyCallExpression}; }`
            },
            { filePath: 'foo.ts', content: '' }
        ]
    });
}

export function expectFooReference(project: Project): void {
    const result = getReferencedModules(project.getSourceFileOrThrow('a.ts'), packageJsonPath);
    assert.deepStrictEqual(result, [
        { kind: 'local-code', filePath: project.getSourceFileOrThrow('foo.ts').getFilePath() }
    ]);
}

export function expectNoReferences(project: Project): void {
    const result = getReferencedModules(project.getSourceFileOrThrow('a.ts'), packageJsonPath);
    assert.deepStrictEqual(result, []);
}
