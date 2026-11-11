import assert from 'node:assert';
import { suite, test } from 'mocha';
import { bundleResource } from '../test-libraries/bundle-fixtures.ts';
import { assertDefined } from '../test-libraries/deep-subset-assertion.ts';
import { assertDeadCodeEliminationBehaviorEquivalent } from '../test-libraries/dead-code-elimination-oracle-test-support.ts';
import { createTestEliminator } from '../test-libraries/eliminator-fixtures.ts';
import { bundleForCodeFile, inputs } from '../test-libraries/eliminator-test-support.ts';

const observerCode = {
    name: 'observer',
    inputFilePath: '/observer/index.js',
    targetFilePath: 'index.js',
    content: [
        'import * as ns from "package/index.js";',
        'export function api() { return { names: Object.keys(ns), values: ns }; }'
    ]
        .join('\n')
};

suite('eliminator star reexports', function () {
    const cases = [
        {
            name: 'ordinary stars without forwarding defaults',
            entry: 'export * from "./a.js";',
            modules: { 'a.js': 'export const a = 1; export default 9; const unused = 0;' }
        },
        {
            name: 'unique exports alongside ambiguous stars',
            entry: 'export * from "./a.js"; export * from "./b.js"; export const value = 42;',
            modules: {
                'a.js': 'export const clash = 1; export const a = 1;',
                'b.js': 'export const clash = 2; export const b = 2;'
            }
        },
        {
            name: 'explicit disambiguation',
            entry: 'export * from "./a.js"; export * from "./b.js"; export { clash } from "./b.js";',
            modules: {
                'a.js': 'export const clash = 1; export const a = 1;',
                'b.js': 'export const clash = 2; export const b = 2;'
            }
        },
        {
            name: 'transitive ambiguity',
            entry: 'export * from "./barrel.js";',
            modules: {
                'barrel.js': 'export * from "./a.js"; export * from "./b.js";',
                'a.js': 'export const clash = 1; export const a = 1;',
                'b.js': 'export const clash = 2; export const b = 2;'
            }
        },
        {
            name: 'cycles',
            entry: 'export * from "./a.js";',
            modules: {
                'a.js': 'export * from "./b.js"; export const a = 1;',
                'b.js': 'export * from "./a.js"; export const b = 2;'
            }
        },
        {
            name: 'multiple paths to the same binding',
            entry: 'export * from "./a.js"; export * from "./b.js";',
            modules: {
                'a.js': 'export * from "./shared.js";',
                'b.js': 'export * from "./shared.js";',
                'shared.js': 'export const shared = 3;'
            }
        },
        {
            name: 'namespace reexports including defaults',
            entry: 'export * as ns from "./a.js";',
            modules: { 'a.js': 'export const a = 1; export default 9;' }
        },
        {
            name: 'a namespace inside a star barrel',
            entry: 'export * from "./barrel.js";',
            modules: {
                'barrel.js': 'export * as ns from "./a.js";',
                'a.js': 'export const a = 1; export default 9;'
            }
        },
        {
            name: 'local aliases and renamed defaults',
            entry: 'export * from "./barrel.js";',
            modules: {
                'barrel.js': 'export { default as renamed } from "./a.js"; export * from "./a.js";',
                'a.js': 'const local = 7; export { local as a }; export default 9;'
            }
        }
    ];

    for (const scenario of cases) {
        for (const withDeclarations of [ false, true ]) {
            test(`preserves ${scenario.name}, declaration companions: ${withDeclarations}`, async function () {
                const observer = bundleForCodeFile(observerCode);
                const modules = Object.entries(scenario.modules);
                const resources = [
                    ...modules,
                    ...withDeclarations
                        ? modules.map(function ([ name, content ]) {
                            return [ name.replace('.js', '.d.ts'), content ] as const;
                        })
                        : []
                ];
                const fixture = bundleForCodeFile({
                    name: 'package',
                    inputFilePath: '/source/index.js',
                    targetFilePath: 'index.js',
                    content: scenario.entry,
                    extraResources: resources.map(function ([ name, content ]) {
                        return {
                            ...bundleResource(`/source/${name}`, { content, targetFilePath: name }),
                            isSubstituted: false
                        };
                    })
                });
                const bundle = {
                    ...fixture,
                    contents: fixture.contents.map(function (resource) {
                        return {
                            ...resource,
                            directDependencies: new Set(resource.moduleReferences.flatMap(function (reference) {
                                return reference.type === 'local-code' ? [ reference.targetFilePath ] : [];
                            }))
                        };
                    })
                };
                const [ emitted ] = await createTestEliminator().eliminate(inputs(bundle));
                assertDefined(emitted);

                await assertDeadCodeEliminationBehaviorEquivalent({
                    name: scenario.name,
                    entry: { bundleName: 'observer', targetFilePath: 'index.js', exportName: 'api' },
                    leftName: 'original',
                    leftBundles: [ bundle, observer ],
                    rightName: 'eliminated',
                    rightBundles: [ emitted, observer ]
                });
                assert.strictEqual(
                    emitted.contents.some(function (resource) {
                        return resource.fileDescription.content.includes('const unused');
                    }),
                    false
                );
            });
        }
    }
});
