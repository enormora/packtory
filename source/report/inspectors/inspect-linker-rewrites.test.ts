import assert from 'node:assert';
import { test } from 'mocha';
import { inspectLinkerRewrites } from './inspect-linker-rewrites.ts';

test('inspectLinkerRewrites returns no rewrites when no resource is substituted', () => {
    const rewrites = inspectLinkerRewrites({
        contents: [{ fileDescription: { sourceFilePath: '/src/a.ts' }, isSubstituted: false }],
        linkedBundleDependencies: new Map<string, unknown>([['pkg-b', {}]])
    });

    assert.deepStrictEqual(rewrites, []);
});

test('inspectLinkerRewrites emits one rewrite per substituted resource per linked bundle', () => {
    const rewrites = inspectLinkerRewrites({
        contents: [
            { fileDescription: { sourceFilePath: '/src/a.ts' }, isSubstituted: true },
            { fileDescription: { sourceFilePath: '/src/b.ts' }, isSubstituted: true }
        ],
        linkedBundleDependencies: new Map<string, unknown>([
            ['pkg-b', {}],
            ['pkg-c', {}]
        ])
    });

    assert.deepStrictEqual(rewrites, [
        { file: '/src/a.ts', fromSpecifier: '/src/a.ts', toSpecifier: 'pkg-b', targetBundle: 'pkg-b' },
        { file: '/src/a.ts', fromSpecifier: '/src/a.ts', toSpecifier: 'pkg-c', targetBundle: 'pkg-c' },
        { file: '/src/b.ts', fromSpecifier: '/src/b.ts', toSpecifier: 'pkg-b', targetBundle: 'pkg-b' },
        { file: '/src/b.ts', fromSpecifier: '/src/b.ts', toSpecifier: 'pkg-c', targetBundle: 'pkg-c' }
    ]);
});

test('inspectLinkerRewrites returns an empty array when given no resources', () => {
    const rewrites = inspectLinkerRewrites({
        contents: [],
        linkedBundleDependencies: new Map<string, unknown>([['pkg-b', {}]])
    });

    assert.deepStrictEqual(rewrites, []);
});

test('inspectLinkerRewrites returns an empty array when there are no linked bundle dependencies', () => {
    const rewrites = inspectLinkerRewrites({
        contents: [{ fileDescription: { sourceFilePath: '/src/a.ts' }, isSubstituted: true }],
        linkedBundleDependencies: new Map<string, unknown>()
    });

    assert.deepStrictEqual(rewrites, []);
});

test('inspectLinkerRewrites emits rewrites only for the substituted resources when the bundle mixes substituted and unmodified files', () => {
    const rewrites = inspectLinkerRewrites({
        contents: [
            { fileDescription: { sourceFilePath: '/src/a.ts' }, isSubstituted: true },
            { fileDescription: { sourceFilePath: '/src/b.ts' }, isSubstituted: false }
        ],
        linkedBundleDependencies: new Map<string, unknown>([['pkg-b', {}]])
    });

    assert.deepStrictEqual(rewrites, [
        { file: '/src/a.ts', fromSpecifier: '/src/a.ts', toSpecifier: 'pkg-b', targetBundle: 'pkg-b' }
    ]);
});
