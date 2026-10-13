import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { LinkedBundleResource } from '../linker/linked-bundle.ts';
import { assertDefined } from '../test-libraries/deep-subset-assertion.ts';
import { bundleResource, linkedBundle, type BundleFixtureLinkedBundle } from '../test-libraries/bundle-fixtures.ts';
import {
    assertDeadCodeEliminationEquivalent,
    type DeadCodeEliminationOracleEntry
} from '../test-libraries/dead-code-elimination-oracle-test-support.ts';
import { createTestEliminator } from '../test-libraries/eliminator-fixtures.ts';
import {
    bundleForCodeFile,
    consumerBundleWith,
    inputs,
    producerBundleWith
} from '../test-libraries/eliminator-test-support.ts';

function declarationImportBundle(): BundleFixtureLinkedBundle {
    const entryResource = {
        ...bundleResource('/source/index.js', { content: 'export const live = 1;\n', targetFilePath: 'index.js' }),
        isSubstituted: false
    };
    const privateDeclarationResource = {
        ...bundleResource('/source/private.d.ts', {
            content: 'import type { Imported } from "./types.js";\nexport type Private = Imported;\n',
            targetFilePath: 'private.d.ts'
        }),
        isSubstituted: false
    };
    const typesDeclarationResource = {
        ...bundleResource('/source/types.d.ts', {
            content: 'export type Imported = string;\nexport type Other = number;\n',
            targetFilePath: 'types.d.ts'
        }),
        isSubstituted: false
    };
    return linkedBundle({
        name: 'package',
        contents: [ entryResource, privateDeclarationResource, typesDeclarationResource ],
        roots: {
            main: {
                javaScript: {
                    content: '',
                    isExecutable: false,
                    inputFilePath: '/source/index.js',
                    targetFilePath: 'index.js'
                },
                declarationFile: privateDeclarationResource.fileDescription
            }
        },
        surface: { mode: 'implicit', defaultModuleRoot: 'main' }
    });
}

function companionRegressionResource(
    inputFilePath: string,
    targetFilePath: string,
    content: string
): LinkedBundleResource {
    return {
        ...bundleResource(inputFilePath, { content, targetFilePath }),
        isSubstituted: false
    };
}

function companionRegressionProducerBundle(): BundleFixtureLinkedBundle {
    const index = companionRegressionResource(
        '/source/package-producer/index.js',
        'package-producer/index.js',
        [
            'import { baseSharedConfig } from "./base-shared.js";',
            '',
            'const baseRuleConfig = {',
            '    plugins: {',
            '        ...baseSharedConfig.plugins',
            '    },',
            '    rules: {',
            '        ...baseSharedConfig.rules',
            '    }',
            '};',
            '',
            'export const producerConfig = [ baseRuleConfig ];',
            '',
            'export function api() {',
            '    return producerConfig[0].rules["example/basic-rule"];',
            '}',
            ''
        ]
            .join('\n')
    );
    const baseShared = companionRegressionResource(
        '/source/package-producer/base-shared.js',
        'package-producer/base-shared.js',
        [
            'import { sharedConfig } from "./shared.js";',
            '',
            'export const baseSharedConfig = {',
            '    plugins: {',
            '        ...sharedConfig.plugins',
            '    },',
            '    rules: {',
            '        ...sharedConfig.rules',
            '    }',
            '};',
            ''
        ]
            .join('\n')
    );
    const baseSharedDeclaration = companionRegressionResource(
        '/source/package-producer/base-shared.d.ts',
        'package-producer/base-shared.d.ts',
        [
            'export declare const baseSharedConfig: {',
            '    readonly rules: {',
            "        readonly 'example/basic-rule': 'error';",
            '    };',
            '};',
            ''
        ]
            .join('\n')
    );
    const shared = companionRegressionResource(
        '/source/package-producer/shared.js',
        'package-producer/shared.js',
        [
            'import { plugin } from "./plugin.js";',
            '',
            'const unusedConfig = {',
            '    rules: {',
            '        unused: "off"',
            '    }',
            '};',
            '',
            'export const sharedConfig = {',
            '    plugins: {',
            '        example: plugin',
            '    },',
            '    rules: {',
            '        "example/basic-rule": "error"',
            '    }',
            '};',
            ''
        ]
            .join('\n')
    );
    const sharedDeclaration = companionRegressionResource(
        '/source/package-producer/shared.d.ts',
        'package-producer/shared.d.ts',
        [
            'export declare const sharedConfig: {',
            '    readonly rules: {',
            "        readonly 'example/basic-rule': 'error';",
            '    };',
            '};',
            ''
        ]
            .join('\n')
    );
    const plugin = companionRegressionResource(
        '/source/package-producer/plugin.js',
        'package-producer/plugin.js',
        [
            'export const plugin = {',
            '    rules: {',
            '        "basic-rule": {}',
            '    }',
            '};',
            ''
        ]
            .join('\n')
    );

    return linkedBundle({
        name: 'package-producer',
        contents: [ index, baseShared, baseSharedDeclaration, shared, sharedDeclaration, plugin ],
        roots: {
            main: {
                javaScript: {
                    content: index.fileDescription.content,
                    isExecutable: false,
                    inputFilePath: '/source/package-producer/index.js',
                    targetFilePath: 'package-producer/index.js'
                }
            }
        },
        surface: { mode: 'implicit', defaultModuleRoot: 'main' }
    });
}

function companionRegressionConsumerBundle(): BundleFixtureLinkedBundle {
    return linkedBundle({
        name: 'package-consumer',
        contents: [
            companionRegressionResource(
                '/source/package-consumer/index.js',
                'package-consumer/index.js',
                [
                    'import { baseSharedConfig } from "../package-producer/base-shared.js";',
                    '',
                    'export const consumerConfig = {',
                    '    plugins: {',
                    '        ...baseSharedConfig.plugins',
                    '    },',
                    '    rules: {',
                    '        ...baseSharedConfig.rules',
                    '    }',
                    '};',
                    ''
                ]
                    .join('\n')
            )
        ],
        roots: {
            main: {
                javaScript: {
                    content: '',
                    isExecutable: false,
                    inputFilePath: '/source/package-consumer/index.js',
                    targetFilePath: 'package-consumer/index.js'
                }
            }
        },
        surface: { mode: 'implicit', defaultModuleRoot: 'main' }
    });
}

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
                ...bundleResource('/source/index.ts.map', { content: validMapContent, targetFilePath: 'index.ts.map' }),
                isSubstituted: false
            };
            const bundle = bundleForCodeFile({
                name: 'package',
                inputFilePath: '/source/index.ts',
                targetFilePath: 'index.ts',
                content: liveOnlyContent,
                extraResources: [ mapResource ]
            });
            const [ analyzed ] = await eliminator.eliminate(inputs(bundle));
            const emittedMap = analyzed?.contents.find(function (resource) {
                return resource.fileDescription.targetFilePath === 'index.ts.map';
            });
            assertDefined(emittedMap);
            assert.strictEqual(emittedMap.fileDescription.content, validMapContent);
        });

        test('eliminate keeps exported bindings from retained declaration files', async function () {
            const eliminator = createTestEliminator();
            const declarationContent = 'export type Public = number;\nexport type Private = string;';
            const declarationFile = {
                content: declarationContent,
                isExecutable: false,
                inputFilePath: '/source/index.d.ts',
                targetFilePath: 'index.d.ts'
            };
            const resource = { ...bundleResource('/source/index.d.ts', declarationFile), isSubstituted: false };
            const [ analyzed ] = await eliminator.eliminate(
                inputs(
                    linkedBundle({
                        name: 'package',
                        contents: [ resource ],
                        roots: {
                            main: {
                                javaScript: {
                                    content: '',
                                    isExecutable: false,
                                    inputFilePath: '/source/index.js',
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
            assertDefined(emitted);
            assert.deepStrictEqual(emitted.analysis.survivingBindings, new Set([ 'Public', 'Private' ]));
        });

        test('eliminate honours explicit private roots when seeding reachability', async function () {
            const eliminator = createTestEliminator();
            const mainResource = {
                ...bundleResource('/source/index.js', {
                    content: 'export const main = 1;\n',
                    targetFilePath: 'index.js'
                }),
                isSubstituted: false
            };
            const workerResource = {
                ...bundleResource('/source/worker.js', {
                    content: 'export const workerPublic = 1;\nexport const workerPrivate = 2;\n',
                    targetFilePath: 'worker.js'
                }),
                isSubstituted: false
            };
            const [ analyzed ] = await eliminator.eliminate(
                inputs(
                    linkedBundle({
                        name: 'package',
                        contents: [ mainResource, workerResource ],
                        roots: {
                            main: {
                                javaScript: {
                                    content: '',
                                    isExecutable: false,
                                    inputFilePath: '/source/index.js',
                                    targetFilePath: 'index.js'
                                }
                            },
                            worker: {
                                javaScript: {
                                    content: '',
                                    isExecutable: false,
                                    inputFilePath: '/source/worker.js',
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
                return resource.fileDescription.inputFilePath === '/source/worker.js';
            });
            assertDefined(emittedWorker);
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
            assertDefined(producerEmitted);
            assert.strictEqual(producerEmitted.fileDescription.content.includes('used'), true);
            assert.strictEqual(producerEmitted.fileDescription.content.includes('unused'), false);
        });

        test('eliminate keeps a runtime js dependency reachable even when a sibling declaration file is present', async function () {
            const eliminator = createTestEliminator();
            const entryResource = {
                ...bundleResource('/source/index.js', {
                    content: 'import { used } from "./helpers.js";\nexport function live() { return used(); }',
                    targetFilePath: 'index.js'
                }),
                isSubstituted: false
            };
            const helperRuntimeResource = {
                ...bundleResource('/source/helpers.js', {
                    content: 'export function used() { return 1; }\nexport function unused() { return 2; }',
                    targetFilePath: 'helpers.js'
                }),
                isSubstituted: false
            };
            const helperDeclarationResource = {
                ...bundleResource('/source/helpers.d.ts', {
                    content: 'export declare function used(): number;\nexport declare function unused(): number;\n',
                    targetFilePath: 'helpers.d.ts'
                }),
                isSubstituted: false
            };
            const bundle = linkedBundle({
                name: 'package',
                contents: [ entryResource, helperRuntimeResource, helperDeclarationResource ],
                roots: {
                    main: {
                        javaScript: {
                            content: entryResource.fileDescription.content,
                            isExecutable: false,
                            inputFilePath: '/source/index.js',
                            targetFilePath: 'index.js'
                        }
                    }
                },
                surface: { mode: 'implicit', defaultModuleRoot: 'main' }
            });
            const [ analyzed ] = await eliminator.eliminate(inputs(bundle));
            const runtimeHelper = analyzed?.contents.find(function (resource) {
                return resource.fileDescription.inputFilePath === '/source/helpers.js';
            });
            assertDefined(runtimeHelper);
            assert.strictEqual(runtimeHelper.fileDescription.content.includes('used'), true);
            assert.strictEqual(runtimeHelper.fileDescription.content.includes('unused'), false);
        });

        test('eliminate preserves behavior with declaration companions in a runtime import chain', async function () {
            const consumer = companionRegressionConsumerBundle();
            const producer = companionRegressionProducerBundle();
            const entry: DeadCodeEliminationOracleEntry = {
                bundleName: 'package-producer',
                targetFilePath: 'package-producer/index.js',
                exportName: 'api'
            };

            await assertDeadCodeEliminationEquivalent({
                name: 'declaration companion runtime import chain',
                entry,
                eliminationInputs: inputs(consumer, producer)
            });
        });

        test('eliminate keeps type exports imported by public declaration files', async function () {
            const eliminator = createTestEliminator();
            const [ analyzed ] = await eliminator.eliminate(inputs(declarationImportBundle()));
            const emittedTypes = analyzed?.contents.find(function (resource) {
                return resource.fileDescription.inputFilePath === '/source/types.d.ts';
            });
            assertDefined(emittedTypes);
            assert.strictEqual(emittedTypes.fileDescription.content.includes('Imported'), true);
            assert.strictEqual(emittedTypes.fileDescription.content.includes('Other'), false);
            assert.deepStrictEqual(emittedTypes.analysis.survivingBindings, new Set([ 'Imported' ]));
        });

        test('eliminate prunes a producer file whose only consumer-side reference is in unreachable code', async function () {
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
            const producer = result[1];
            assertDefined(producer);
            assert.deepStrictEqual(producer.contents, []);
        });

        test('eliminate removes unrelated dead declarations when the file has top-level side effects', async function () {
            const eliminator = createTestEliminator();
            const sideEffectContent = [
                'function dead() { return 1; }',
                'export function live() { return 2; }',
                'console.log("init");'
            ]
                .join('\n');
            const bundle = bundleForCodeFile({
                name: 'package',
                inputFilePath: '/source/index.ts',
                targetFilePath: 'index.ts',
                content: sideEffectContent
            });
            const [ analyzed ] = await eliminator.eliminate(inputs(bundle));
            const emitted = analyzed?.contents[0];
            assertDefined(emitted);
            assert.strictEqual(emitted.fileDescription.content.includes('dead'), false);
            assert.strictEqual(emitted.fileDescription.content.includes('console.log("init")'), true);
            assert.deepStrictEqual(emitted.analysis.survivingBindings, new Set([ 'live' ]));
        });
    });
});
