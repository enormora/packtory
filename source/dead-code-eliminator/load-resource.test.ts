import assert from 'node:assert';
import { suite, test } from 'mocha';
import { bundleResource } from '../test-libraries/bundle-fixtures.ts';
import { createProject } from '../test-libraries/typescript-project.ts';
import { assertDefined } from '../test-libraries/deep-subset-assertion.ts';
import { loadResources } from './load-resource.ts';
import { createSourceEvaluation } from './evaluation/constant-evaluation.ts';

suite('resource preparation boundaries', function () {
    for (
        const scenario of [
            { name: 'data', paths: [ 'asset.txt' ], content: 'asset', projects: 0 },
            { name: 'runtime', paths: [ 'index.js', 'other.js' ], content: 'export const value=1;', projects: 1 },
            {
                name: 'declarations',
                paths: [ 'index.d.ts', 'other.d.ts' ],
                content: 'export declare const value: number;',
                projects: 1
            }
        ]
    ) {
        test(`creates only required projects for ${scenario.name} resources`, function () {
            const resources = scenario.paths.map(function (targetFilePath) {
                return {
                    ...bundleResource(`/source/${targetFilePath}`, { targetFilePath, content: scenario.content }),
                    isSubstituted: false
                };
            });
            let creations = 0;
            const loaded = loadResources(
                function () {
                    creations += 1;
                    return createProject();
                },
                resources,
                undefined
            );
            assert.strictEqual(loaded.length, resources.length);
            assert.strictEqual(creations, scenario.projects);
        });
    }
    for (const declarationsFirst of [ false, true ]) {
        test(`isolates declaration bindings with declarations first ${String(declarationsFirst)}`, function () {
            const resources = [
                {
                    ...bundleResource('/source/index.js', {
                        targetFilePath: 'index.js',
                        content: 'const value=41;const result=value+1;'
                    }),
                    isSubstituted: false
                },
                {
                    ...bundleResource('/source/index.d.ts', {
                        targetFilePath: 'index.d.ts',
                        content: 'declare const value: string;'
                    }),
                    isSubstituted: false
                }
            ];
            let creations = 0;
            const loaded = loadResources(
                function () {
                    creations += 1;
                    return createProject();
                },
                declarationsFirst ? resources.toReversed() : resources,
                undefined
            );
            const source = loaded
                .find(function (entry) {
                    return entry.resource.fileDescription.targetFilePath === 'index.js';
                })
                ?.sourceFile;
            assertDefined(source);
            assert.deepStrictEqual(
                createSourceEvaluation(source).primitiveValue(
                    source.getVariableDeclarationOrThrow('result').getInitializerOrThrow()
                ),
                { value: 42 }
            );
            assert.strictEqual(creations, 2);
        });
    }

    for (const targetFilePath of [ 'index.ts', 'index.d.ts' ]) {
        test(`loads ${targetFilePath} without transforming its source`, function () {
            const content = 'export const value=1+2;';
            const resource = {
                ...bundleResource(`/source/${targetFilePath}`, { targetFilePath, content }),
                isSubstituted: false
            };
            const [ loaded ] = loadResources(createProject, [ resource ], undefined);
            assertDefined(loaded);
            assertDefined(loaded.sourceFile);
            assert.strictEqual(loaded.sourceFile.getFullText(), content);
            assert.deepStrictEqual(loaded.transformations, []);
        });
    }
});
