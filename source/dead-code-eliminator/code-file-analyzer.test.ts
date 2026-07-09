import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { Node as TsMorphNode, Statement } from 'ts-morph';
import { assertDeepSubset } from '../test-libraries/deep-subset-assertion.ts';
import { createProject } from '../test-libraries/typescript-project.ts';
import { buildAnalyzedResource, type AnalysisContext } from './code-file-analyzer.ts';
import type { LoadedCodeResource, LoadedResource } from './load-bundle.ts';

const statementStub = { id: 'stmt' };
const declarationStub = { id: 'decl' };
const referenceStub = { id: 'ref' };

function loadedCodeResource(targetFilePath: string, content: string): LoadedCodeResource {
    const project = createProject({ withFiles: [ { filePath: targetFilePath, content } ] });
    const sourceFile = project.getSourceFileOrThrow(targetFilePath);
    return {
        resource: {
            fileDescription: {
                sourceFilePath: `/src/${targetFilePath}`,
                targetFilePath,
                content,
                isExecutable: false
            },
            directDependencies: new Set<string>(),
            isExplicitlyIncluded: true,
            isSubstituted: false
        },
        sourceFile,
        bindings: []
    };
}

function nonCodeResource(targetFilePath: string, content: string): LoadedResource {
    return {
        resource: {
            fileDescription: {
                sourceFilePath: `/src/${targetFilePath}`,
                targetFilePath,
                content,
                isExecutable: false
            },
            directDependencies: new Set<string>(),
            isExplicitlyIncluded: true,
            isSubstituted: false
        },
        sourceFile: undefined
    };
}

const baseContext: AnalysisContext = {
    reachable: new Set<string>(),
    transformationsEnabled: false
};

suite('code-file-analyzer', function () {
    test('buildAnalyzedResource returns an empty analysis for non-code resources without transforms', function () {
        const loaded = nonCodeResource('readme.md', '# title');

        const result = buildAnalyzedResource(loaded, baseContext);

        assertDeepSubset(result, {
            transforms: [],
            resource: {
                analysis: {
                    survivingBindings: {
                        size: 0
                    }
                }
            }
        });
    });

    test('buildAnalyzedResource leaves the content unchanged when transformations are disabled', function () {
        const loaded = loadedCodeResource('a.ts', 'export const foo = 1;\n');

        const result = buildAnalyzedResource(loaded, baseContext);

        assertDeepSubset(result, {
            transforms: [],
            resource: {
                fileDescription: {
                    content: 'export const foo = 1;\n'
                }
            }
        });
    });

    test('buildAnalyzedResource includes side-effect statements in the analysis when transformations are disabled', function () {
        const loaded = loadedCodeResource('a.ts', 'console.log(1);\nexport const foo = 1;\n');

        const result = buildAnalyzedResource(loaded, baseContext);

        assert.strictEqual(result.resource.analysis.sideEffectStatements.length, 1);
    });

    test('buildAnalyzedResource leaves the content unchanged when transformations are enabled but the file has side effects', function () {
        const loaded = loadedCodeResource('a.ts', 'console.log(1);\nexport const foo = 1;\n');

        const result = buildAnalyzedResource(loaded, { ...baseContext, transformationsEnabled: true });

        assertDeepSubset(result, {
            transforms: [],
            resource: {
                fileDescription: {
                    content: 'console.log(1);\nexport const foo = 1;\n'
                }
            }
        });
    });

    test('buildAnalyzedResource carries through every original binding name on the analysis when no transform happens', function () {
        const loaded: LoadedCodeResource = {
            ...loadedCodeResource('a.ts', 'export const foo = 1;\n'),
            bindings: [
                {
                    name: 'foo',
                    isExported: true,
                    statement: statementStub as unknown as Statement,
                    declarationNode: declarationStub as unknown as TsMorphNode,
                    referenceNode: referenceStub as unknown as TsMorphNode
                }
            ]
        };

        const result = buildAnalyzedResource(loaded, baseContext);

        assert.strictEqual(result.resource.analysis.survivingBindings.has('foo'), true);
    });
});
