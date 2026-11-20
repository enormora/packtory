import assert from 'node:assert';
import { suite, test } from 'mocha';
import { assertDeepSubset } from '../test-libraries/deep-subset-assertion.ts';
import { createProject } from '../test-libraries/typescript-project.ts';
import { classifySideEffects } from '../test-libraries/side-effect-classifier-test-support.ts';
import { buildAnalyzedResource, type AnalysisContext } from './code-file-analyzer.ts';
import { loadResources, type LoadedCodeResource, type LoadedResource } from './load-resource.ts';
import { bindingIdentifier } from './reachability/binding-identifier.ts';

function loadedCodeResource(content: string): LoadedCodeResource {
    const [ loaded ] = loadResources(createProject, [ {
        fileDescription: {
            inputFilePath: '/source/a.ts',
            targetFilePath: 'a.ts',
            content,
            isExecutable: false
        },
        directDependencies: new Set<string>(),
        moduleReferences: [],
        isExplicitlyIncluded: true,
        isSubstituted: false
    } ]);
    if (loaded?.sourceFile === undefined) {
        assert.fail('Expected a code resource');
    }
    return loaded;
}

function nonCodeResource(targetFilePath: string, content: string): LoadedResource {
    return {
        resource: {
            fileDescription: {
                inputFilePath: `/source/${targetFilePath}`,
                targetFilePath,
                content,
                isExecutable: false
            },
            directDependencies: new Set<string>(),
            moduleReferences: [],
            isExplicitlyIncluded: true,
            isSubstituted: false
        },
        sourceFile: undefined
    };
}

const baseContext: AnalysisContext = {
    bundleName: 'package',
    reachable: new Set<string>(),
    survivingExports: new Map<string, ReadonlySet<string>>(),
    transformationsEnabled: false,
    deadCodeElimination: undefined,
    classifySideEffects,
    trace: undefined
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
        const loaded = loadedCodeResource('import { dead } from "./b";\nexport const foo = 1;\n');

        const result = buildAnalyzedResource(loaded, baseContext);

        assertDeepSubset(result, {
            transforms: [],
            resource: {
                fileDescription: {
                    content: 'import { dead } from "./b";\nexport const foo = 1;\n'
                }
            }
        });
    });

    test('buildAnalyzedResource includes side-effect statements in the analysis when transformations are disabled', function () {
        const loaded = loadedCodeResource('console.log(1);\nexport const foo = 1;\n');

        const result = buildAnalyzedResource(loaded, baseContext);

        assert.deepStrictEqual(result.resource.analysis.sideEffectStatements, [
            { line: 1, kind: 'expression statement' }
        ]);
    });

    test('buildAnalyzedResource retains original effect locations after source preparation', function () {
        const prefix = 'const unused = 0;\n';
        const loaded = loadedCodeResource(`${prefix}console.log(1);\n`);
        loaded.applyEdits([ { start: 0, end: prefix.length, content: '' } ]);

        const result = buildAnalyzedResource(loaded, { ...baseContext, transformationsEnabled: true });

        assert.deepStrictEqual(result.resource.analysis.sideEffectStatements, [
            { line: 2, kind: 'expression statement' }
        ]);
    });

    test('buildAnalyzedResource removes dead declarations while retaining side-effect statements', function () {
        const loaded = loadedCodeResource(
            'import { dead } from "./b";\nconsole.log(1);\nexport const foo = 1;\n'
        );

        const result = buildAnalyzedResource(loaded, {
            ...baseContext,
            reachable: new Set([ bindingIdentifier('a.ts', 'foo') ]),
            transformationsEnabled: true
        });

        assertDeepSubset(result, {
            resource: {
                fileDescription: {
                    content: 'import "./b";\nconsole.log(1);\nexport const foo = 1;\n'
                }
            }
        });
        assert.deepStrictEqual({
            transformCount: result.transforms.length,
            survivingBindings: result.resource.analysis.survivingBindings
        }, { transformCount: 1, survivingBindings: new Set([ 'foo' ]) });
    });

    test('buildAnalyzedResource omits transform records when enabled transformations leave source unchanged', function () {
        const loaded = loadedCodeResource('export const foo = 1;\n');
        const result = buildAnalyzedResource(loaded, {
            ...baseContext,
            reachable: new Set([ bindingIdentifier('a.ts', 'foo') ]),
            transformationsEnabled: true
        });

        assert.deepStrictEqual(result, {
            resource: {
                ...loaded.resource,
                analysis: {
                    survivingBindings: new Set([ 'foo' ]),
                    sideEffectStatements: [],
                    sideEffectImports: new Set()
                }
            },
            transforms: []
        });
    });

    test('buildAnalyzedResource carries through every original binding name on the analysis when no transform happens', function () {
        const loaded = loadedCodeResource('const hidden = 1; export const foo = hidden;\n');

        const result = buildAnalyzedResource(loaded, baseContext);

        assert.deepStrictEqual(result.resource.analysis.survivingBindings, new Set([ 'hidden', 'foo' ]));
    });

    test('buildAnalyzedResource retains source preparation maps before the final transformation', function () {
        const prefix = 'const unused = 0;\n';
        const content = 'export const foo = 1;\n';
        const loaded = loadedCodeResource(prefix + content);
        loaded.applyEdits([ { start: 0, end: prefix.length, content: '' } ]);
        const result = buildAnalyzedResource(loaded, {
            ...baseContext,
            reachable: new Set([ bindingIdentifier('a.ts', 'foo') ]),
            transformationsEnabled: true
        });

        assert.strictEqual(result.transforms.length, 2);
        assert.strictEqual(result.transforms[0]?.textTransform, loaded.transformations[0]);
        assert.deepStrictEqual(result.transforms[1]?.textTransform, {
            originalCode: content,
            transformedCode: content,
            atoms: [ { newStart: 0, originalStart: 0, originalEnd: content.length } ]
        });
    });
});
