import assert from 'node:assert';
import { suite, test } from 'mocha';
import { inspectLinkerRewrites } from './inspect-linker-rewrites.ts';

suite('inspect-linker-rewrites', function () {
    test('inspectLinkerRewrites returns no rewrites when no resource is substituted', function () {
        const rewrites = inspectLinkerRewrites({
            contents: [ { fileDescription: { inputFilePath: '/source/a.ts' }, isSubstituted: false } ],
            linkedBundleDependencies: new Map<string, unknown>([ [ 'package-b', {} ] ])
        });

        assert.deepStrictEqual(rewrites, []);
    });

    test('inspectLinkerRewrites emits one rewrite per substituted resource per linked bundle', function () {
        const rewrites = inspectLinkerRewrites({
            contents: [
                { fileDescription: { inputFilePath: '/source/a.ts' }, isSubstituted: true },
                { fileDescription: { inputFilePath: '/source/b.ts' }, isSubstituted: true }
            ],
            linkedBundleDependencies: new Map<string, unknown>([
                [ 'package-b', {} ],
                [ 'package-c', {} ]
            ])
        });

        assert.deepStrictEqual(rewrites, [
            {
                file: '/source/a.ts',
                fromSpecifier: '/source/a.ts',
                toSpecifier: 'package-b',
                targetBundle: 'package-b'
            },
            {
                file: '/source/a.ts',
                fromSpecifier: '/source/a.ts',
                toSpecifier: 'package-c',
                targetBundle: 'package-c'
            },
            {
                file: '/source/b.ts',
                fromSpecifier: '/source/b.ts',
                toSpecifier: 'package-b',
                targetBundle: 'package-b'
            },
            { file: '/source/b.ts', fromSpecifier: '/source/b.ts', toSpecifier: 'package-c', targetBundle: 'package-c' }
        ]);
    });

    test('inspectLinkerRewrites returns an empty array when given no resources', function () {
        const rewrites = inspectLinkerRewrites({
            contents: [],
            linkedBundleDependencies: new Map<string, unknown>([ [ 'package-b', {} ] ])
        });

        assert.deepStrictEqual(rewrites, []);
    });

    test('inspectLinkerRewrites returns an empty array when there are no linked bundle dependencies', function () {
        const rewrites = inspectLinkerRewrites({
            contents: [ { fileDescription: { inputFilePath: '/source/a.ts' }, isSubstituted: true } ],
            linkedBundleDependencies: new Map<string, unknown>()
        });

        assert.deepStrictEqual(rewrites, []);
    });

    test('inspectLinkerRewrites emits rewrites only for the substituted resources when the bundle mixes substituted and unmodified files', function () {
        const rewrites = inspectLinkerRewrites({
            contents: [
                { fileDescription: { inputFilePath: '/source/a.ts' }, isSubstituted: true },
                { fileDescription: { inputFilePath: '/source/b.ts' }, isSubstituted: false }
            ],
            linkedBundleDependencies: new Map<string, unknown>([ [ 'package-b', {} ] ])
        });

        assert.deepStrictEqual(rewrites, [
            { file: '/source/a.ts', fromSpecifier: '/source/a.ts', toSpecifier: 'package-b', targetBundle: 'package-b' }
        ]);
    });
});
