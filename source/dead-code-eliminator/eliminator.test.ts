import assert from 'node:assert';
import { test } from 'mocha';
import type { LinkedBundle, LinkedBundleResource } from '../linker/linked-bundle.ts';
import { createProgressBroadcaster } from '../progress/progress-broadcaster.ts';
import { analyzedBundle, bundleResource, linkedBundle } from '../test-libraries/bundle-fixtures.ts';
import { createTestEliminator } from '../test-libraries/eliminator-fixtures.ts';
import { createProject } from '../test-libraries/typescript-project.ts';
import type { AnalyzedBundle } from './analyzed-bundle.ts';
import { createDeadCodeEliminator } from './eliminator.ts';

function inputs(
    ...bundles: readonly LinkedBundle[]
): readonly { bundle: LinkedBundle; transformationsEnabled: boolean }[] {
    return bundles.map((bundle) => {
        return { bundle, transformationsEnabled: true };
    });
}

type CodeFileSpec = {
    readonly name: string;
    readonly sourceFilePath: string;
    readonly targetFilePath: string;
    readonly content: string;
    readonly extraResources?: readonly LinkedBundleResource[];
};

function bundleForCodeFile(spec: CodeFileSpec): LinkedBundle {
    const root = {
        js: {
            content: spec.content,
            isExecutable: false,
            sourceFilePath: spec.sourceFilePath,
            targetFilePath: spec.targetFilePath
        }
    } as const;
    const codeResource = {
        ...bundleResource(spec.sourceFilePath, { content: spec.content, targetFilePath: spec.targetFilePath }),
        isSubstituted: false
    };
    return linkedBundle({
        name: spec.name,
        contents: [codeResource, ...(spec.extraResources ?? [])],
        roots: { main: root },
        entryPoints: [root],
        surface: { mode: 'implicit', defaultModuleRoot: 'main' }
    });
}

function collectTargetPaths(analyzed: AnalyzedBundle | undefined): readonly string[] {
    assert.ok(analyzed !== undefined);
    return analyzed.contents.map((resource) => {
        return resource.fileDescription.targetFilePath;
    });
}

test('eliminate returns one analyzed bundle per linked bundle', async () => {
    const eliminator = createTestEliminator();
    const result = await eliminator.eliminate(inputs(linkedBundle({ name: 'a' }), linkedBundle({ name: 'b' })));
    assert.strictEqual(result.length, 2);
});

test('eliminate preserves the bundle name', async () => {
    const eliminator = createTestEliminator();
    const [analyzed] = await eliminator.eliminate(inputs(linkedBundle({ name: 'pkg' })));
    assert.strictEqual(analyzed?.name, 'pkg');
});

test('eliminate returns no bundles when given no input', async () => {
    const eliminator = createTestEliminator();
    const result = await eliminator.eliminate([]);
    assert.deepStrictEqual(result, []);
});

test('eliminate emits elimination progress for the original input bundles', async () => {
    const broadcaster = createProgressBroadcaster();
    const received: string[][] = [];
    broadcaster.consumer.on('eliminationCompleted', (payload) => {
        received.push(
            payload.perBundle.map((bundle) => {
                return bundle.packageName;
            })
        );
    });
    const eliminator = createDeadCodeEliminator({
        createProject: () => createProject(),
        progressBroadcaster: broadcaster.provider
    });

    await eliminator.eliminate(inputs(linkedBundle({ name: 'pkg-a' }), linkedBundle({ name: 'pkg-b' })));

    assert.deepStrictEqual(received, [['pkg-a', 'pkg-b']]);
});

test('eliminate populates analysis on every resource', async () => {
    const eliminator = createTestEliminator();
    const [analyzed] = await eliminator.eliminate(
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

test('eliminate sets sideEffectsField to false for empty bundles', async () => {
    const eliminator = createTestEliminator();
    const result = await eliminator.eliminate(inputs(linkedBundle({ name: 'a' }), linkedBundle({ name: 'b' })));
    for (const bundle of result) {
        assert.strictEqual(bundle.sideEffectsField, false);
    }
});

test('eliminate copies entryPoints, externalDependencies, and linkedBundleDependencies through unchanged', async () => {
    const eliminator = createTestEliminator();
    const input = linkedBundle({
        name: 'a',
        externalDependencies: new Map([['dep', { name: 'dep', referencedFrom: ['/src/index.js'] }]]),
        linkedBundleDependencies: new Map([['bundle', { name: 'bundle', referencedFrom: ['/src/index.js'] }]])
    });
    const [analyzed] = await eliminator.eliminate(inputs(input));
    assert.strictEqual(analyzed?.entryPoints, input.entryPoints);
    assert.strictEqual(analyzed.externalDependencies, input.externalDependencies);
    assert.strictEqual(analyzed.linkedBundleDependencies, input.linkedBundleDependencies);
});

test('eliminate preserves resource fields and uses empty analysis defaults on non-code files', async () => {
    const eliminator = createTestEliminator();
    const resource = { ...bundleResource('/src/LICENSE', { content: 'Hello' }), isSubstituted: false };
    const [analyzed] = await eliminator.eliminate(inputs(linkedBundle({ name: 'pkg', contents: [resource] })));
    const emitted = analyzed?.contents[0];
    assert.ok(emitted !== undefined);
    assert.strictEqual(emitted.fileDescription, resource.fileDescription);
    assert.strictEqual(emitted.isSubstituted, false);
    assert.strictEqual(emitted.directDependencies, resource.directDependencies);
    assert.strictEqual(emitted.isExplicitlyIncluded, resource.isExplicitlyIncluded);
    assert.deepStrictEqual(emitted.analysis, {
        survivingBindings: new Set<string>(),
        sideEffectStatements: [],
        sideEffectImports: new Set<string>()
    });
});

test('eliminate accepts an analyzed bundle fixture and treats it like any linked bundle', async () => {
    const eliminator = createTestEliminator();
    const input: AnalyzedBundle = analyzedBundle({ name: 'pkg' });
    const [analyzed] = await eliminator.eliminate(inputs(input));
    assert.strictEqual(analyzed?.name, 'pkg');
    assert.strictEqual(analyzed.sideEffectsField, false);
});

const indexTsContent = ['function dead() { return 1; }', 'export function live() { return 2; }'].join('\n');
const indexTsBundle = (extraResources: readonly LinkedBundleResource[] = []): LinkedBundle => {
    return bundleForCodeFile({
        name: 'pkg',
        sourceFilePath: '/src/index.ts',
        targetFilePath: 'index.ts',
        content: indexTsContent,
        extraResources
    });
};

test('eliminate removes an unreachable function declaration and records the surviving bindings when transformations are enabled', async () => {
    const eliminator = createTestEliminator();
    const [analyzed] = await eliminator.eliminate(inputs(indexTsBundle()));
    const emitted = analyzed?.contents[0];
    assert.ok(emitted !== undefined);
    assert.strictEqual(emitted.fileDescription.content.includes('dead'), false);
    assert.strictEqual(emitted.fileDescription.content.includes('live'), true);
    assert.deepStrictEqual(emitted.analysis.survivingBindings, new Set(['live']));
});

test('eliminate keeps unreachable declarations when transformations are disabled', async () => {
    const eliminator = createTestEliminator();
    const result = await eliminator.eliminate([{ bundle: indexTsBundle(), transformationsEnabled: false }]);
    const emitted = result[0]?.contents[0];
    assert.ok(emitted !== undefined);
    assert.strictEqual(emitted.fileDescription.content, indexTsContent);
});

test('eliminate recomposes the paired source map when a code file is transformed', async () => {
    const eliminator = createTestEliminator();
    const originalMap = JSON.stringify({
        version: 3,
        file: 'index.ts',
        sources: ['index.ts'],
        sourcesContent: [indexTsContent],
        names: [],
        // cspell:disable-next-line
        mappings: 'AAAA,SAAS,IAAI,IAAI,CAAC,OAAO,CAAC,CAAC,CAAC;AAC5B,OAAO,SAAS,IAAI,IAAI,CAAC,OAAO,CAAC,CAAC,CAAC,CAAC'
    });
    const mapResource = {
        ...bundleResource('/src/index.ts.map', { content: originalMap, targetFilePath: 'index.ts.map' }),
        isSubstituted: false
    };
    const [analyzed] = await eliminator.eliminate(inputs(indexTsBundle([mapResource])));
    const emittedTargetPaths = collectTargetPaths(analyzed);
    assert.strictEqual(emittedTargetPaths.includes('index.ts.map'), true);
    assert.strictEqual(emittedTargetPaths.includes('index.ts'), true);
    const emittedMap = analyzed?.contents.find((resource) => {
        return resource.fileDescription.targetFilePath === 'index.ts.map';
    });
    assert.ok(emittedMap !== undefined);
    assert.notStrictEqual(emittedMap.fileDescription.content, originalMap);
    const parsed = JSON.parse(emittedMap.fileDescription.content) as { mappings: string; version: number };
    assert.strictEqual(parsed.version, 3);
    assert.ok(parsed.mappings.length > 0);
});

test('eliminate keeps the paired source map untouched when no transformation occurs', async () => {
    const eliminator = createTestEliminator();
    const liveOnlyContent = 'export function live() { return 2; }';
    const validMapContent = JSON.stringify({
        version: 3,
        file: 'index.ts',
        sources: ['index.ts'],
        sourcesContent: [liveOnlyContent],
        names: [],
        // cspell:disable-next-line
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
        extraResources: [mapResource]
    });
    const [analyzed] = await eliminator.eliminate(inputs(bundle));
    const emittedMap = analyzed?.contents.find((resource) => {
        return resource.fileDescription.targetFilePath === 'index.ts.map';
    });
    assert.ok(emittedMap !== undefined);
    assert.strictEqual(emittedMap.fileDescription.content, validMapContent);
});

test('eliminate honours an entry point declaration file when seeding reachability', async () => {
    const eliminator = createTestEliminator();
    const declarationContent = 'export type Public = number;\nexport type Private = string;';
    const declarationFile = {
        content: declarationContent,
        isExecutable: false,
        sourceFilePath: '/src/index.d.ts',
        targetFilePath: 'index.d.ts'
    };
    const resource = { ...bundleResource('/src/index.d.ts', declarationFile), isSubstituted: false };
    const [analyzed] = await eliminator.eliminate(
        inputs(
            linkedBundle({
                name: 'pkg',
                contents: [resource],
                entryPoints: [
                    {
                        js: {
                            content: '',
                            isExecutable: false,
                            sourceFilePath: '/src/index.js',
                            targetFilePath: 'index.js'
                        },
                        declarationFile
                    }
                ]
            })
        )
    );
    const emitted = analyzed?.contents[0];
    assert.ok(emitted !== undefined);
    assert.deepStrictEqual(emitted.analysis.survivingBindings, new Set(['Public', 'Private']));
});

function producerBundleWith(helpersContent: string): LinkedBundle {
    const producerHelpers = {
        ...bundleResource('/producer/helpers.ts', { content: helpersContent, targetFilePath: 'helpers.ts' }),
        isSubstituted: false
    };
    return linkedBundle({
        name: 'producer',
        contents: [producerHelpers],
        entryPoints: [
            {
                js: {
                    content: '',
                    isExecutable: false,
                    sourceFilePath: '/producer/index.js',
                    targetFilePath: 'index.js'
                }
            }
        ]
    });
}

function consumerBundleWith(content: string): LinkedBundle {
    return bundleForCodeFile({
        name: 'consumer',
        sourceFilePath: '/consumer/index.ts',
        targetFilePath: 'index.ts',
        content
    });
}

test('eliminate uses cross-bundle seeds to keep an exported function reachable when consumed by another bundle', async () => {
    const eliminator = createTestEliminator();
    const result = await eliminator.eliminate(
        inputs(
            consumerBundleWith('import { used } from "producer/helpers.ts";\nexport function pub() { return used(); }'),
            producerBundleWith('export function used() { return 1; }\nexport function unused() { return 2; }')
        )
    );
    const producerEmitted = result[1]?.contents[0];
    assert.ok(producerEmitted !== undefined);
    assert.strictEqual(producerEmitted.fileDescription.content.includes('used'), true);
    assert.strictEqual(producerEmitted.fileDescription.content.includes('unused'), true);
});

test('eliminate drops a producer binding whose only consumer-side reference is in unreachable code', async () => {
    const eliminator = createTestEliminator();
    const consumerContent = [
        'import { used } from "producer/helpers.ts";',
        'function dead() { return used(); }',
        'export function pub() { return 1; }'
    ].join('\n');
    const result = await eliminator.eliminate(
        inputs(consumerBundleWith(consumerContent), producerBundleWith('export function used() { return 1; }'))
    );
    const producerEmitted = result[1]?.contents[0];
    assert.ok(producerEmitted !== undefined);
    assert.strictEqual(producerEmitted.fileDescription.content.includes('used'), false);
});

test('eliminate keeps all declarations and reports them as surviving when the file has top-level side effects', async () => {
    const eliminator = createTestEliminator();
    const sideEffectContent = [
        'function dead() { return 1; }',
        'export function live() { return 2; }',
        'console.log("init");'
    ].join('\n');
    const bundle = bundleForCodeFile({
        name: 'pkg',
        sourceFilePath: '/src/index.ts',
        targetFilePath: 'index.ts',
        content: sideEffectContent
    });
    const [analyzed] = await eliminator.eliminate(inputs(bundle));
    const emitted = analyzed?.contents[0];
    assert.ok(emitted !== undefined);
    assert.strictEqual(emitted.fileDescription.content.includes('dead'), true);
    assert.deepStrictEqual(emitted.analysis.survivingBindings, new Set(['dead', 'live']));
});
