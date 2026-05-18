import assert from 'node:assert';
import { suite, test } from 'mocha';
import { content, rootWithDeclaration, rootWithSource } from '../test-libraries/package-surface-fixtures.ts';
import { getImplicitPublicModuleSpecifier } from './implicit-specifier-build.ts';

suite('implicit-specifier-build', function () {
    test("returns the bare package name for the default root's js source path", function () {
        const result = getImplicitPublicModuleSpecifier(
            { name: 'package-a', roots: { main: rootWithSource('/src/index.js', 'index.js') }, contents: [] },
            { mode: 'implicit', defaultModuleRoot: 'main' },
            '/src/index.js'
        );

        assert.strictEqual(result, 'package-a');
    });

    test("returns the bare package name for the default root's declaration source path", function () {
        const result = getImplicitPublicModuleSpecifier(
            {
                name: 'package-a',
                roots: { main: rootWithDeclaration('/src/index.js', 'index.js', '/src/index.d.ts', 'index.d.ts') },
                contents: []
            },
            { mode: 'implicit', defaultModuleRoot: 'main' },
            '/src/index.d.ts'
        );

        assert.strictEqual(result, 'package-a');
    });

    test('returns "<name>/<jsTargetFilePath>" for a non-default declaration source path', function () {
        const result = getImplicitPublicModuleSpecifier(
            {
                name: 'package-a',
                roots: {
                    main: rootWithSource('/src/index.js', 'index.js'),
                    helper: rootWithDeclaration('/src/helper.js', 'helper.js', '/src/helper.d.ts', 'helper.d.ts')
                },
                contents: []
            },
            { mode: 'implicit', defaultModuleRoot: 'main' },
            '/src/helper.d.ts'
        );

        assert.strictEqual(result, 'package-a/helper.js');
    });

    test('returns "<name>/<targetFilePath>" for a content source path not bound to any root', function () {
        const result = getImplicitPublicModuleSpecifier(
            {
                name: 'package-a',
                roots: { main: rootWithSource('/src/index.js', 'index.js') },
                contents: [content('/src/feature.js', 'feature.js')]
            },
            { mode: 'implicit', defaultModuleRoot: 'main' },
            '/src/feature.js'
        );

        assert.strictEqual(result, 'package-a/feature.js');
    });

    test('returns undefined for a source path that is neither a root nor content', function () {
        const result = getImplicitPublicModuleSpecifier(
            { name: 'package-a', roots: { main: rootWithSource('/src/index.js', 'index.js') }, contents: [] },
            { mode: 'implicit', defaultModuleRoot: 'main' },
            '/src/missing.js'
        );

        assert.strictEqual(result, undefined);
    });

    test('uses content lookup when an .mts declaration cannot be matched to a root', function () {
        const result = getImplicitPublicModuleSpecifier(
            {
                name: 'package-a',
                roots: { main: rootWithSource('/src/index.js', 'index.js') },
                contents: [content('/src/module.d.mts', 'module.d.mts')]
            },
            { mode: 'implicit', defaultModuleRoot: 'main' },
            '/src/module.d.mts'
        );

        assert.strictEqual(result, 'package-a/module.d.mts');
    });

    test('uses content lookup when an .cts declaration cannot be matched to a root', function () {
        const result = getImplicitPublicModuleSpecifier(
            {
                name: 'package-a',
                roots: { main: rootWithSource('/src/index.js', 'index.js') },
                contents: [content('/src/common.d.cts', 'common.d.cts')]
            },
            { mode: 'implicit', defaultModuleRoot: 'main' },
            '/src/common.d.cts'
        );

        assert.strictEqual(result, 'package-a/common.d.cts');
    });

    test('exposes a declaration-only file via its content target path', function () {
        const result = getImplicitPublicModuleSpecifier(
            {
                name: 'package-a',
                roots: { main: rootWithSource('/src/index.js', 'index.js') },
                contents: [content('/src/foo.d.ts', 'foo.d.ts')]
            },
            { mode: 'implicit', defaultModuleRoot: 'main' },
            '/src/foo.d.ts'
        );

        assert.strictEqual(result, 'package-a/foo.d.ts');
    });

    test('does not reinterpret unsupported file types as declaration companions', function () {
        const result = getImplicitPublicModuleSpecifier(
            {
                name: 'package-a',
                roots: { main: rootWithSource('/src/index.js', 'index.js') },
                contents: [content('/src/notes.txt', 'notes.txt')]
            },
            { mode: 'implicit', defaultModuleRoot: 'main' },
            '/src/notes.txt'
        );

        assert.strictEqual(result, 'package-a/notes.txt');
    });

    test('prefers a declaration-root match over a content match for the same source path', function () {
        const result = getImplicitPublicModuleSpecifier(
            {
                name: 'package-a',
                roots: {
                    main: rootWithSource('/src/index.js', 'index.js'),
                    helper: rootWithDeclaration('/src/helper.js', 'helper.js', '/src/helper.d.ts', 'helper.d.ts')
                },
                contents: [content('/src/helper.d.ts', 'helper.d.ts')]
            },
            { mode: 'implicit', defaultModuleRoot: 'main' },
            '/src/helper.d.ts'
        );

        assert.strictEqual(result, 'package-a/helper.js');
    });
});
