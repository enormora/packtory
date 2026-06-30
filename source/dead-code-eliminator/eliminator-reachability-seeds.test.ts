import assert from 'node:assert';
import { suite, test } from 'mocha';
import { bundleResource, linkedBundle } from '../test-libraries/bundle-fixtures.ts';
import { createTestEliminator } from '../test-libraries/eliminator-fixtures.ts';
import { bundleForCodeFile, consumerBundleWith, inputs, producerBundleWith } from './eliminator.test-support.ts';

suite('eliminator reachability seeds', function () {
    suite('declaration files and cross-bundle reachability', function () {
        test('eliminate keeps the paired source map untouched when no transformation occurs', async function () {
            const eliminator = createTestEliminator();
            const liveOnlyContent = 'export function live() { return 2; }';
            const validMapContent = JSON.stringify({
                version: 3,
                file: 'index.ts',
                sources: [ 'index.ts' ],
                sourcesContent: [ liveOnlyContent ],
                names: [],
                mappings: 'AAAA,OAAO,SAAS,IAAI,IAAI,CAAC,OAAO,CAAC,CAAC,CAAC,CAAC'
            });
            const mapResource = {
                ...bundleResource('/src/index.ts.map', { content: validMapContent, targetFilePath: 'index.ts.map' }),
                isSubstituted: false
            };
            const bundle = bundleForCodeFile({
                name: 'pkg',
                sourceFilePath: '/src/index.ts',
                targetFilePath: 'index.ts',
                content: liveOnlyContent,
                extraResources: [ mapResource ]
            });
            const [ analyzed ] = await eliminator.eliminate(inputs(bundle));
            const emittedMap = analyzed?.contents.find(function (resource) {
                return resource.fileDescription.targetFilePath === 'index.ts.map';
            });
            assert.ok(emittedMap !== undefined);
            assert.strictEqual(emittedMap.fileDescription.content, validMapContent);
        });

        test('eliminate honours a root declaration file when seeding reachability', async function () {
            const eliminator = createTestEliminator();
            const declarationContent = 'export type Public = number;\nexport type Private = string;';
            const declarationFile = {
                content: declarationContent,
                isExecutable: false,
                sourceFilePath: '/src/index.d.ts',
                targetFilePath: 'index.d.ts'
            };
            const resource = { ...bundleResource('/src/index.d.ts', declarationFile), isSubstituted: false };
            const [ analyzed ] = await eliminator.eliminate(
                inputs(
                    linkedBundle({
                        name: 'pkg',
                        contents: [ resource ],
                        roots: {
                            main: {
                                js: {
                                    content: '',
                                    isExecutable: false,
                                    sourceFilePath: '/src/index.js',
                                    targetFilePath: 'index.js'
                                },
                                declarationFile
                            }
                        },
                        surface: { mode: 'implicit', defaultModuleRoot: 'main' }
                    })
                )
            );
            const emitted = analyzed?.contents[0];
            assert.ok(emitted !== undefined);
            assert.deepStrictEqual(emitted.analysis.survivingBindings, new Set([ 'Public', 'Private' ]));
        });

        test('eliminate honours explicit private roots when seeding reachability', async function () {
            const eliminator = createTestEliminator();
            const mainResource = {
                ...bundleResource('/src/index.js', { content: 'export const main = 1;\n', targetFilePath: 'index.js' }),
                isSubstituted: false
            };
            const workerResource = {
                ...bundleResource('/src/worker.js', {
                    content: 'export const workerPublic = 1;\nexport const workerPrivate = 2;\n',
                    targetFilePath: 'worker.js'
                }),
                isSubstituted: false
            };
            const [ analyzed ] = await eliminator.eliminate(
                inputs(
                    linkedBundle({
                        name: 'pkg',
                        contents: [ mainResource, workerResource ],
                        roots: {
                            main: {
                                js: {
                                    content: '',
                                    isExecutable: false,
                                    sourceFilePath: '/src/index.js',
                                    targetFilePath: 'index.js'
                                }
                            },
                            worker: {
                                js: {
                                    content: '',
                                    isExecutable: false,
                                    sourceFilePath: '/src/worker.js',
                                    targetFilePath: 'worker.js'
                                }
                            }
                        },
                        surface: {
                            mode: 'explicit',
                            packageInterface: {
                                modules: [ { root: 'main', export: '.' } ],
                                privateRoots: [ 'worker' ]
                            }
                        }
                    })
                )
            );
            const emittedWorker = analyzed?.contents.find(function (resource) {
                return resource.fileDescription.sourceFilePath === '/src/worker.js';
            });
            assert.ok(emittedWorker !== undefined);
            assert.deepStrictEqual(
                emittedWorker.analysis.survivingBindings,
                new Set([ 'workerPublic', 'workerPrivate' ])
            );
        });

        test('eliminate uses cross-bundle seeds to keep an exported function reachable when consumed by another bundle', async function () {
            const eliminator = createTestEliminator();
            const result = await eliminator.eliminate(
                inputs(
                    consumerBundleWith(
                        'import { used } from "producer/helpers.ts";\nexport function pub() { return used(); }'
                    ),
                    producerBundleWith('export function used() { return 1; }\nexport function unused() { return 2; }')
                )
            );
            const producerEmitted = result[1]?.contents[0];
            assert.ok(producerEmitted !== undefined);
            assert.strictEqual(producerEmitted.fileDescription.content.includes('used'), true);
            assert.strictEqual(producerEmitted.fileDescription.content.includes('unused'), false);
        });

        test('eliminate keeps a runtime js dependency reachable even when a sibling declaration file is present', async function () {
            const eliminator = createTestEliminator();
            const entryResource = {
                ...bundleResource('/src/index.js', {
                    content: 'import { used } from "./helpers.js";\nexport function live() { return used(); }',
                    targetFilePath: 'index.js'
                }),
                isSubstituted: false
            };
            const helperRuntimeResource = {
                ...bundleResource('/src/helpers.js', {
                    content: 'export function used() { return 1; }\nexport function unused() { return 2; }',
                    targetFilePath: 'helpers.js'
                }),
                isSubstituted: false
            };
            const helperDeclarationResource = {
                ...bundleResource('/src/helpers.d.ts', {
                    content: 'export declare function used(): number;\nexport declare function unused(): number;\n',
                    targetFilePath: 'helpers.d.ts'
                }),
                isSubstituted: false
            };
            const bundle = linkedBundle({
                name: 'pkg',
                contents: [ entryResource, helperRuntimeResource, helperDeclarationResource ],
                roots: {
                    main: {
                        js: {
                            content: entryResource.fileDescription.content,
                            isExecutable: false,
                            sourceFilePath: '/src/index.js',
                            targetFilePath: 'index.js'
                        }
                    }
                },
                surface: { mode: 'implicit', defaultModuleRoot: 'main' }
            });
            const [ analyzed ] = await eliminator.eliminate(inputs(bundle));
            const runtimeHelper = analyzed?.contents.find(function (resource) {
                return resource.fileDescription.sourceFilePath === '/src/helpers.js';
            });
            assert.ok(runtimeHelper !== undefined);
            assert.strictEqual(runtimeHelper.fileDescription.content.includes('used'), true);
            assert.strictEqual(runtimeHelper.fileDescription.content.includes('unused'), false);
        });

        test('eliminate drops a producer binding whose only consumer-side reference is in unreachable code', async function () {
            const eliminator = createTestEliminator();
            const consumerContent = [
                'import { used } from "producer/helpers.ts";',
                'function dead() { return used(); }',
                'export function pub() { return 1; }'
            ]
                .join('\n');
            const result = await eliminator.eliminate(
                inputs(consumerBundleWith(consumerContent), producerBundleWith('export function used() { return 1; }'))
            );
            const producerEmitted = result[1]?.contents[0];
            assert.ok(producerEmitted !== undefined);
            assert.strictEqual(producerEmitted.fileDescription.content.includes('used'), false);
        });

        test('eliminate keeps all declarations and reports them as surviving when the file has top-level side effects', async function () {
            const eliminator = createTestEliminator();
            const sideEffectContent = [
                'function dead() { return 1; }',
                'export function live() { return 2; }',
                'console.log("init");'
            ]
                .join('\n');
            const bundle = bundleForCodeFile({
                name: 'pkg',
                sourceFilePath: '/src/index.ts',
                targetFilePath: 'index.ts',
                content: sideEffectContent
            });
            const [ analyzed ] = await eliminator.eliminate(inputs(bundle));
            const emitted = analyzed?.contents[0];
            assert.ok(emitted !== undefined);
            assert.strictEqual(emitted.fileDescription.content.includes('dead'), true);
            assert.deepStrictEqual(emitted.analysis.survivingBindings, new Set([ 'dead', 'live' ]));
        });
    });
});
