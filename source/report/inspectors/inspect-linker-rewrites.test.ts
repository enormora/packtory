import assert from 'node:assert';
import { suite, test } from 'mocha';
import { inspectLinkerRewrites } from './inspect-linker-rewrites.ts';

suite('inspect-linker-rewrites', function () {
    test('inspectLinkerRewrites returns no rewrites when no resource is substituted', function () {
        const rewrites = inspectLinkerRewrites({
            contents: [ { fileDescription: { sourceFilePath: '/src/a.ts' }, isSubstituted: false } ],
            linkedBundleDependencies: new Map<string, unknown>([ [ 'pkg-b', {} ] ])
        });

        assert.deepStrictEqual(rewrites, []);
    });

    test('inspectLinkerRewrites emits one rewrite per substituted resource per linked bundle', function () {
        const rewrites = inspectLinkerRewrites({
            contents: [
                { fileDescription: { sourceFilePath: '/src/a.ts' }, isSubstituted: true },
                { fileDescription: { sourceFilePath: '/src/b.ts' }, isSubstituted: true }
            ],
            linkedBundleDependencies: new Map<string, unknown>([
                [ 'pkg-b', {} ],
                [ 'pkg-c', {} ]
            ])
        });

        assert.deepStrictEqual(rewrites, [
            { file: '/src/a.ts', fromSpecifier: '/src/a.ts', toSpecifier: 'pkg-b', targetBundle: 'pkg-b' },
            { file: '/src/a.ts', fromSpecifier: '/src/a.ts', toSpecifier: 'pkg-c', targetBundle: 'pkg-c' },
            { file: '/src/b.ts', fromSpecifier: '/src/b.ts', toSpecifier: 'pkg-b', targetBundle: 'pkg-b' },
            { file: '/src/b.ts', fromSpecifier: '/src/b.ts', toSpecifier: 'pkg-c', targetBundle: 'pkg-c' }
        ]);
    });

    test('inspectLinkerRewrites returns an empty array when given no resources', function () {
        const rewrites = inspectLinkerRewrites({
            contents: [],
            linkedBundleDependencies: new Map<string, unknown>([ [ 'pkg-b', {} ] ])
        });

        assert.deepStrictEqual(rewrites, []);
    });

    test('inspectLinkerRewrites returns an empty array when there are no linked bundle dependencies', function () {
        const rewrites = inspectLinkerRewrites({
            contents: [ { fileDescription: { sourceFilePath: '/src/a.ts' }, isSubstituted: true } ],
            linkedBundleDependencies: new Map<string, unknown>()
        });

        assert.deepStrictEqual(rewrites, []);
    });

    test('inspectLinkerRewrites emits rewrites only for the substituted resources when the bundle mixes substituted and unmodified files', function () {
        const rewrites = inspectLinkerRewrites({
            contents: [
                { fileDescription: { sourceFilePath: '/src/a.ts' }, isSubstituted: true },
                { fileDescription: { sourceFilePath: '/src/b.ts' }, isSubstituted: false }
            ],
            linkedBundleDependencies: new Map<string, unknown>([ [ 'pkg-b', {} ] ])
        });

        assert.deepStrictEqual(rewrites, [
            { file: '/src/a.ts', fromSpecifier: '/src/a.ts', toSpecifier: 'pkg-b', targetBundle: 'pkg-b' }
        ]);
    });
});
