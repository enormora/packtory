import assert from 'node:assert';
import { test } from 'mocha';
import type { LinkedBundle } from '../linker/linked-bundle.ts';
import { analyzedBundle, bundleResource, linkedBundle } from '../test-libraries/bundle-fixtures.ts';
import type { AnalyzedBundle } from './analyzed-bundle.ts';
import { createDeadCodeEliminator } from './eliminator.ts';

function inputs(
    ...bundles: readonly LinkedBundle[]
): readonly { bundle: LinkedBundle; transformationsEnabled: boolean }[] {
    return bundles.map((bundle) => {
        return { bundle, transformationsEnabled: true };
    });
}

test('eliminate returns one analyzed bundle per linked bundle', async () => {
    const eliminator = createDeadCodeEliminator();
    const result = await eliminator.eliminate(inputs(linkedBundle({ name: 'a' }), linkedBundle({ name: 'b' })));
    assert.strictEqual(result.length, 2);
});

test('eliminate preserves the bundle name', async () => {
    const eliminator = createDeadCodeEliminator();
    const [analyzed] = await eliminator.eliminate(inputs(linkedBundle({ name: 'pkg' })));
    assert.strictEqual(analyzed?.name, 'pkg');
});

test('eliminate returns no bundles when given no input', async () => {
    const eliminator = createDeadCodeEliminator();
    const result = await eliminator.eliminate([]);
    assert.deepStrictEqual(result, []);
});

test('eliminate populates analysis on every resource', async () => {
    const eliminator = createDeadCodeEliminator();
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
    const eliminator = createDeadCodeEliminator();
    const result = await eliminator.eliminate(inputs(linkedBundle({ name: 'a' }), linkedBundle({ name: 'b' })));
    for (const bundle of result) {
        assert.strictEqual(bundle.sideEffectsField, false);
    }
});

test('eliminate copies entryPoints, externalDependencies, and linkedBundleDependencies through unchanged', async () => {
    const eliminator = createDeadCodeEliminator();
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

test('eliminate preserves resource fields apart from analysis on non-code files', async () => {
    const eliminator = createDeadCodeEliminator();
    const resource = { ...bundleResource('/src/LICENSE', { content: 'Hello' }), isSubstituted: false };
    const [analyzed] = await eliminator.eliminate(inputs(linkedBundle({ name: 'pkg', contents: [resource] })));
    const emitted = analyzed?.contents[0];
    assert.strictEqual(emitted?.fileDescription, resource.fileDescription);
    assert.strictEqual(emitted.isSubstituted, false);
    assert.strictEqual(emitted.directDependencies, resource.directDependencies);
    assert.strictEqual(emitted.isExplicitlyIncluded, resource.isExplicitlyIncluded);
});

test('eliminate accepts an analyzed bundle fixture and treats it like any linked bundle', async () => {
    const eliminator = createDeadCodeEliminator();
    const input: AnalyzedBundle = analyzedBundle({ name: 'pkg' });
    const [analyzed] = await eliminator.eliminate(inputs(input));
    assert.strictEqual(analyzed?.name, 'pkg');
    assert.strictEqual(analyzed.sideEffectsField, false);
});

test('eliminate removes an unreachable function declaration from the emitted content when transformations are enabled', async () => {
    const eliminator = createDeadCodeEliminator();
    const content = ['function dead() { return 1; }', 'export function live() { return 2; }'].join('\n');
    const resource = {
        ...bundleResource('/src/index.ts', { content, targetFilePath: 'index.ts' }),
        isSubstituted: false
    };
    const [analyzed] = await eliminator.eliminate(
        inputs(
            linkedBundle({
                name: 'pkg',
                contents: [resource],
                entryPoints: [
                    {
                        js: {
                            content,
                            isExecutable: false,
                            sourceFilePath: '/src/index.ts',
                            targetFilePath: 'index.ts'
                        }
                    }
                ]
            })
        )
    );
    const emitted = analyzed?.contents[0];
    assert.ok(emitted !== undefined);
    assert.strictEqual(emitted.fileDescription.content.includes('dead'), false);
    assert.strictEqual(emitted.fileDescription.content.includes('live'), true);
});

test('eliminate keeps unreachable declarations when transformations are disabled', async () => {
    const eliminator = createDeadCodeEliminator();
    const content = ['function dead() { return 1; }', 'export function live() { return 2; }'].join('\n');
    const resource = {
        ...bundleResource('/src/index.ts', { content, targetFilePath: 'index.ts' }),
        isSubstituted: false
    };
    const result = await eliminator.eliminate([
        {
            bundle: linkedBundle({
                name: 'pkg',
                contents: [resource],
                entryPoints: [
                    {
                        js: {
                            content,
                            isExecutable: false,
                            sourceFilePath: '/src/index.ts',
                            targetFilePath: 'index.ts'
                        }
                    }
                ]
            }),
            transformationsEnabled: false
        }
    ]);
    const emitted = result[0]?.contents[0];
    assert.ok(emitted !== undefined);
    assert.strictEqual(emitted.fileDescription.content, content);
});

test('eliminate drops the paired source map when a code file is transformed', async () => {
    const eliminator = createDeadCodeEliminator();
    const content = ['function dead() { return 1; }', 'export function live() { return 2; }'].join('\n');
    const codeResource = {
        ...bundleResource('/src/index.ts', { content, targetFilePath: 'index.ts' }),
        isSubstituted: false
    };
    const mapResource = {
        ...bundleResource('/src/index.ts.map', { content: '{"version":3}', targetFilePath: 'index.ts.map' }),
        isSubstituted: false
    };
    const [analyzed] = await eliminator.eliminate(
        inputs(
            linkedBundle({
                name: 'pkg',
                contents: [codeResource, mapResource],
                entryPoints: [
                    {
                        js: {
                            content,
                            isExecutable: false,
                            sourceFilePath: '/src/index.ts',
                            targetFilePath: 'index.ts'
                        }
                    }
                ]
            })
        )
    );
    const targetPaths = analyzed?.contents.map((resource) => {
        return resource.fileDescription.targetFilePath;
    });
    assert.ok(targetPaths !== undefined);
    assert.strictEqual(targetPaths.includes('index.ts.map'), false);
    assert.strictEqual(targetPaths.includes('index.ts'), true);
});

test('eliminate keeps the paired source map when no transformation occurs', async () => {
    const eliminator = createDeadCodeEliminator();
    const content = 'export function live() { return 2; }';
    const codeResource = {
        ...bundleResource('/src/index.ts', { content, targetFilePath: 'index.ts' }),
        isSubstituted: false
    };
    const mapResource = {
        ...bundleResource('/src/index.ts.map', { content: '{"version":3}', targetFilePath: 'index.ts.map' }),
        isSubstituted: false
    };
    const [analyzed] = await eliminator.eliminate(
        inputs(
            linkedBundle({
                name: 'pkg',
                contents: [codeResource, mapResource],
                entryPoints: [
                    {
                        js: {
                            content,
                            isExecutable: false,
                            sourceFilePath: '/src/index.ts',
                            targetFilePath: 'index.ts'
                        }
                    }
                ]
            })
        )
    );
    const targetPaths = analyzed?.contents.map((resource) => {
        return resource.fileDescription.targetFilePath;
    });
    assert.ok(targetPaths !== undefined);
    assert.strictEqual(targetPaths.includes('index.ts.map'), true);
});

test('eliminate keeps all declarations when the file has top-level side effects', async () => {
    const eliminator = createDeadCodeEliminator();
    const content = [
        'function dead() { return 1; }',
        'export function live() { return 2; }',
        'console.log("init");'
    ].join('\n');
    const resource = {
        ...bundleResource('/src/index.ts', { content, targetFilePath: 'index.ts' }),
        isSubstituted: false
    };
    const [analyzed] = await eliminator.eliminate(
        inputs(
            linkedBundle({
                name: 'pkg',
                contents: [resource],
                entryPoints: [
                    {
                        js: {
                            content,
                            isExecutable: false,
                            sourceFilePath: '/src/index.ts',
                            targetFilePath: 'index.ts'
                        }
                    }
                ]
            })
        )
    );
    const emitted = analyzed?.contents[0];
    assert.ok(emitted !== undefined);
    assert.strictEqual(emitted.fileDescription.content.includes('dead'), true);
});
