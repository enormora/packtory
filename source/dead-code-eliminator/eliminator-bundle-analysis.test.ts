import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { LinkedBundleResource } from '../linker/linked-bundle.ts';
import { createProgressBroadcaster } from '../progress/progress-broadcaster.ts';
import { analyzedBundle, bundleResource, linkedBundle } from '../test-libraries/bundle-fixtures.ts';
import { createTestEliminator } from '../test-libraries/eliminator-fixtures.ts';
import { createProject } from '../test-libraries/typescript-project.ts';
import {
    bundleForCodeFile,
    collectTargetPaths,
    indexTsBundle,
    indexTsContent,
    inputs
} from '../test-libraries/eliminator-test-support.ts';
import type { AnalyzedBundle } from './analyzed-bundle.ts';
import { createDeadCodeEliminator } from './eliminator.ts';

type NamedBundle = {
    readonly packageName: string;
};

function packageNamesFor(bundles: readonly NamedBundle[]): readonly string[] {
    return Array.from(bundles, function (bundle) {
        return bundle.packageName;
    });
}

function originalIndexMap(): string {
    return JSON.stringify({
        version: 3,
        file: 'index.ts',
        sources: [ 'index.ts' ],
        sourcesContent: [ indexTsContent ],
        names: [],
        mappings: 'AAAA,SAAS,IAAI,IAAI,CAAC,OAAO,CAAC,CAAC,CAAC;AAC5B,OAAO,SAAS,IAAI,IAAI,CAAC,OAAO,CAAC,CAAC,CAAC,CAAC'
    });
}

function pairedMapResource(originalMap: string): LinkedBundleResource {
    return {
        ...bundleResource('/src/index.ts.map', { content: originalMap, targetFilePath: 'index.ts.map' }),
        isSubstituted: false
    };
}

function assertRecomposedMap(analyzed: AnalyzedBundle | undefined, originalMap: string): void {
    const emittedTargetPaths = collectTargetPaths(analyzed);
    assert.strictEqual(emittedTargetPaths.includes('index.ts.map'), true);
    assert.strictEqual(emittedTargetPaths.includes('index.ts'), true);
    const emittedMap = analyzed?.contents.find(function (resource) {
        return resource.fileDescription.targetFilePath === 'index.ts.map';
    });
    assert.notStrictEqual(emittedMap, undefined);
    assert.notStrictEqual(emittedMap.fileDescription.content, originalMap);
    const parsed = JSON.parse(emittedMap.fileDescription.content) as {
        readonly mappings: string;
        readonly version: number;
    };
    assert.strictEqual(parsed.version, 3);
    assert.ok(parsed.mappings.length > 0);
}

suite('eliminator bundle analysis', function () {
    suite('bundle result metadata', function () {
        test('eliminate returns one analyzed bundle per linked bundle', async function () {
            const eliminator = createTestEliminator();
            const result = await eliminator.eliminate(inputs(linkedBundle({ name: 'a' }), linkedBundle({ name: 'b' })));
            assert.strictEqual(result.length, 2);
        });

        test('eliminate preserves the bundle name', async function () {
            const eliminator = createTestEliminator();
            const [ analyzed ] = await eliminator.eliminate(inputs(linkedBundle({ name: 'pkg' })));
            assert.strictEqual(analyzed?.name, 'pkg');
        });

        test('eliminate returns no bundles when given no input', async function () {
            const eliminator = createTestEliminator();
            const result = await eliminator.eliminate([]);
            assert.deepStrictEqual(result, []);
        });

        test('eliminate emits elimination progress for the original input bundles', async function () {
            const broadcaster = createProgressBroadcaster();
            const received: string[][] = [];
            broadcaster.consumer.on('eliminationCompleted', function (payload) {
                received.push(Array.from(packageNamesFor(payload.perBundle)));
            });
            const eliminator = createDeadCodeEliminator({
                createProject() {
                    return createProject();
                },
                progressBroadcaster: broadcaster.provider
            });

            await eliminator.eliminate(inputs(linkedBundle({ name: 'pkg-a' }), linkedBundle({ name: 'pkg-b' })));

            assert.deepStrictEqual(received, [ [ 'pkg-a', 'pkg-b' ] ]);
        });

        test('eliminate populates analysis on every resource', async function () {
            const eliminator = createTestEliminator();
            const [ analyzed ] = await eliminator.eliminate(
                inputs(
                    linkedBundle({
                        name: 'pkg',
                        contents: [
                            { ...bundleResource('/a.ts'), isSubstituted: false },
                            { ...bundleResource('/b.ts'), isSubstituted: false }
                        ]
                    })
                )
            );
            assert.strictEqual(analyzed?.contents.length, 2);
            for (const resource of analyzed.contents) {
                assert.deepStrictEqual(resource.analysis, {
                    survivingBindings: new Set<string>(),
                    sideEffectStatements: [],
                    sideEffectImports: new Set<string>()
                });
            }
        });

        test('eliminate sets sideEffectsField to false for empty bundles', async function () {
            const eliminator = createTestEliminator();
            const result = await eliminator.eliminate(inputs(linkedBundle({ name: 'a' }), linkedBundle({ name: 'b' })));
            for (const bundle of result) {
                assert.strictEqual(bundle.sideEffectsField, false);
            }
        });

        test('eliminate copies roots, externalDependencies, and linkedBundleDependencies through unchanged', async function () {
            const eliminator = createTestEliminator();
            const input = linkedBundle({
                name: 'a',
                externalDependencies: new Map([ [ 'dep', { name: 'dep', referencedFrom: [ '/src/index.js' ] } ] ]),
                linkedBundleDependencies: new Map([ [ 'bundle', {
                    name: 'bundle',
                    referencedFrom: [ '/src/index.js' ]
                } ] ])
            });
            const [ analyzed ] = await eliminator.eliminate(inputs(input));
            assert.partialDeepStrictEqual(analyzed, {
                roots: input.roots,
                externalDependencies: input.externalDependencies,
                linkedBundleDependencies: input.linkedBundleDependencies
            });
        });

        test('eliminate preserves resource fields and uses empty analysis defaults on non-code files', async function () {
            const eliminator = createTestEliminator();
            const resource = { ...bundleResource('/src/LICENSE', { content: 'Hello' }), isSubstituted: false };
            const [ analyzed ] = await eliminator.eliminate(
                inputs(linkedBundle({ name: 'pkg', contents: [ resource ] }))
            );
            const emitted = analyzed?.contents[0];
            assert.notStrictEqual(emitted, undefined);
            assert.partialDeepStrictEqual(emitted, {
                fileDescription: resource.fileDescription,
                isSubstituted: false,
                directDependencies: resource.directDependencies,
                isExplicitlyIncluded: resource.isExplicitlyIncluded,
                analysis: {
                    survivingBindings: new Set<string>(),
                    sideEffectStatements: [],
                    sideEffectImports: new Set<string>()
                }
            });
        });
    });

    suite('transformed code and source maps', function () {
        test('eliminate accepts an analyzed bundle fixture and treats it like any linked bundle', async function () {
            const eliminator = createTestEliminator();
            const input: AnalyzedBundle = analyzedBundle({ name: 'pkg' });
            const [ analyzed ] = await eliminator.eliminate(inputs(input));
            assert.partialDeepStrictEqual(analyzed, {
                name: 'pkg',
                sideEffectsField: false
            });
        });

        test('eliminate removes an unreachable function declaration and records the surviving bindings when transformations are enabled', async function () {
            const eliminator = createTestEliminator();
            const [ analyzed ] = await eliminator.eliminate(inputs(indexTsBundle()));
            const emitted = analyzed?.contents[0];
            assert.notStrictEqual(emitted, undefined);
            assert.strictEqual(emitted.fileDescription.content.includes('dead'), false);
            assert.strictEqual(emitted.fileDescription.content.includes('live'), true);
            assert.deepStrictEqual(emitted.analysis.survivingBindings, new Set([ 'live' ]));
        });

        test('eliminate keeps exported destructuring bindings in an entry file', async function () {
            const eliminator = createTestEliminator();
            const bundle = bundleForCodeFile({
                name: 'pkg',
                sourceFilePath: '/src/index.ts',
                targetFilePath: 'index.ts',
                content: [
                    'const api = { live() { return 1; }, dead() { return 2; } };',
                    'export const { live, dead } = api;'
                ]
                    .join('\n')
            });
            const [ analyzed ] = await eliminator.eliminate(inputs(bundle));
            const emitted = analyzed?.contents[0];
            assert.notStrictEqual(emitted, undefined);
            assert.strictEqual(emitted.fileDescription.content.includes('export const { live, dead } = api;'), true);
            assert.deepStrictEqual(emitted.analysis.survivingBindings, new Set([ 'api', 'live', 'dead' ]));
        });

        test('eliminate keeps a whole destructuring declarator when one bound identifier is reachable', async function () {
            const eliminator = createTestEliminator();
            const bundle = bundleForCodeFile({
                name: 'pkg',
                sourceFilePath: '/src/index.ts',
                targetFilePath: 'index.ts',
                content: [
                    'function build() { return { helper() { return 1; }, other() { return 2; } }; }',
                    'const { helper, other } = build();',
                    'export function live() { return helper(); }'
                ]
                    .join('\n')
            });
            const [ analyzed ] = await eliminator.eliminate(inputs(bundle));
            const emitted = analyzed?.contents[0];
            assert.notStrictEqual(emitted, undefined);
            assert.strictEqual(emitted.fileDescription.content.includes('const { helper, other } = build();'), true);
            assert.deepStrictEqual(emitted.analysis.survivingBindings, new Set([ 'helper', 'other', 'build', 'live' ]));
        });

        test('eliminate preserves a pure destructuring declarator when one bound identifier is reachable', async function () {
            const eliminator = createTestEliminator();
            const bundle = bundleForCodeFile({
                name: 'pkg',
                sourceFilePath: '/src/index.ts',
                targetFilePath: 'index.ts',
                content: [ 'const { helper, other } = { helper: 1, other: 2 };', 'export const live = helper;' ].join(
                    '\n'
                )
            });
            const [ analyzed ] = await eliminator.eliminate(inputs(bundle));
            const emitted = analyzed?.contents[0];
            assert.notStrictEqual(emitted, undefined);
            assert.strictEqual(
                emitted.fileDescription.content.includes('const { helper, other } = { helper: 1, other: 2 };'),
                true
            );
            assert.deepStrictEqual(emitted.analysis.survivingBindings, new Set([ 'helper', 'other', 'live' ]));
        });

        test('eliminate keeps shorthand property value bindings when an exported object literal uses them', async function () {
            const eliminator = createTestEliminator();
            const bundle = bundleForCodeFile({
                name: 'pkg',
                sourceFilePath: '/src/index.ts',
                targetFilePath: 'index.ts',
                content: [
                    'const globalSchema = 1;',
                    'const perPackageSchema = 2;',
                    'function run() { return 3; }',
                    'export const rule = { globalSchema, perPackageSchema, run };'
                ]
                    .join('\n')
            });
            const [ analyzed ] = await eliminator.eliminate(inputs(bundle));
            const emitted = analyzed?.contents[0];
            assert.notStrictEqual(emitted, undefined);
            assert.strictEqual(emitted.fileDescription.content.includes('const globalSchema = 1;'), true);
            assert.strictEqual(emitted.fileDescription.content.includes('const perPackageSchema = 2;'), true);
            assert.strictEqual(emitted.fileDescription.content.includes('function run()'), true);
            assert.deepStrictEqual(
                emitted.analysis.survivingBindings,
                new Set([ 'globalSchema', 'perPackageSchema', 'run', 'rule' ])
            );
        });

        test('eliminate keeps unreachable declarations when transformations are disabled', async function () {
            const eliminator = createTestEliminator();
            const result = await eliminator.eliminate([ { bundle: indexTsBundle(), transformationsEnabled: false } ]);
            const emitted = result[0]?.contents[0];
            assert.notStrictEqual(emitted, undefined);
            assert.strictEqual(emitted.fileDescription.content, indexTsContent);
        });

        test('eliminate recomposes the paired source map when a code file is transformed', async function () {
            const eliminator = createTestEliminator();
            const originalMap = originalIndexMap();
            const mapResource = pairedMapResource(originalMap);
            const [ analyzed ] = await eliminator.eliminate(inputs(indexTsBundle([ mapResource ])));
            assertRecomposedMap(analyzed, originalMap);
        });
    });
});
