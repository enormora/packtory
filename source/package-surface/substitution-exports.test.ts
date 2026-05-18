import assert from 'node:assert';
import { suite, test } from 'mocha';
import { content, rootWithSource } from '../test-libraries/package-surface-fixtures.ts';
import { collectSubstitutionExports } from './substitution-exports.ts';

suite('substitution-exports', function () {
    test('returns an empty record when no substitution paths are provided', function () {
        const result = collectSubstitutionExports(
            { name: 'package-a', roots: { main: rootWithSource('/src/index.js', 'index.js') }, contents: [] },
            new Set()
        );

        assert.deepStrictEqual(result, {});
    });

    test('skips a substitution path that matches a root js source path', function () {
        const result = collectSubstitutionExports(
            {
                name: 'package-a',
                roots: { main: rootWithSource('/src/index.js', 'index.js') },
                contents: [content('/src/index.js', 'index.js')]
            },
            new Set(['/src/index.js'])
        );

        assert.deepStrictEqual(result, {});
    });

    test('exposes a non-root content path as "./<targetFilePath>"', function () {
        const result = collectSubstitutionExports(
            {
                name: 'package-a',
                roots: { main: rootWithSource('/src/index.js', 'index.js') },
                contents: [content('/src/public.js', 'public.js')]
            },
            new Set(['/src/public.js'])
        );

        assert.deepStrictEqual(result['./public.js'], { import: './public.js' });
    });

    test('pairs a .js substitution with its .d.ts companion when present in contents', function () {
        const result = collectSubstitutionExports(
            {
                name: 'package-a',
                roots: { main: rootWithSource('/src/index.js', 'index.js') },
                contents: [content('/src/feature.js', 'feature.js'), content('/src/feature.d.ts', 'feature.d.ts')]
            },
            new Set(['/src/feature.js'])
        );

        assert.deepStrictEqual(result['./feature.js'], { import: './feature.js', types: './feature.d.ts' });
    });

    test('pairs a .mjs substitution with its .d.mts companion when present', function () {
        const result = collectSubstitutionExports(
            {
                name: 'package-a',
                roots: { main: rootWithSource('/src/index.js', 'index.js') },
                contents: [content('/src/module.mjs', 'module.mjs'), content('/src/module.d.mts', 'module.d.mts')]
            },
            new Set(['/src/module.mjs'])
        );

        assert.deepStrictEqual(result['./module.mjs'], { import: './module.mjs', types: './module.d.mts' });
    });

    test('pairs a .cjs substitution with its .d.cts companion when present', function () {
        const result = collectSubstitutionExports(
            {
                name: 'package-a',
                roots: { main: rootWithSource('/src/index.js', 'index.js') },
                contents: [content('/src/common.cjs', 'common.cjs'), content('/src/common.d.cts', 'common.d.cts')]
            },
            new Set(['/src/common.cjs'])
        );

        assert.deepStrictEqual(result['./common.cjs'], { import: './common.cjs', types: './common.d.cts' });
    });

    test('omits the types entry when no declaration companion exists for a .js substitution', function () {
        const result = collectSubstitutionExports(
            {
                name: 'package-a',
                roots: { main: rootWithSource('/src/index.js', 'index.js') },
                contents: [content('/src/feature.js', 'feature.js')]
            },
            new Set(['/src/feature.js'])
        );

        assert.deepStrictEqual(result['./feature.js'], { import: './feature.js' });
    });

    test('exposes a non-code substitution target without searching for a declaration companion', function () {
        const result = collectSubstitutionExports(
            {
                name: 'package-a',
                roots: { main: rootWithSource('/src/index.js', 'index.js') },
                contents: [content('/src/data.json', 'data.json')]
            },
            new Set(['/src/data.json'])
        );

        assert.deepStrictEqual(result['./data.json'], { import: './data.json' });
    });

    test('omits a substitution whose target is a .d.ts declaration', function () {
        const result = collectSubstitutionExports(
            {
                name: 'package-a',
                roots: { main: rootWithSource('/src/index.js', 'index.js') },
                contents: [content('/src/types.d.ts', 'types.d.ts')]
            },
            new Set(['/src/types.d.ts'])
        );

        assert.deepStrictEqual(result, {});
    });

    test('omits a substitution whose target is a .d.mts declaration', function () {
        const result = collectSubstitutionExports(
            {
                name: 'package-a',
                roots: { main: rootWithSource('/src/index.js', 'index.js') },
                contents: [content('/src/types.d.mts', 'types.d.mts')]
            },
            new Set(['/src/types.d.mts'])
        );

        assert.deepStrictEqual(result, {});
    });

    test('omits a substitution whose target is a .d.cts declaration', function () {
        const result = collectSubstitutionExports(
            {
                name: 'package-a',
                roots: { main: rootWithSource('/src/index.js', 'index.js') },
                contents: [content('/src/types.d.cts', 'types.d.cts')]
            },
            new Set(['/src/types.d.cts'])
        );

        assert.deepStrictEqual(result, {});
    });

    test('skips a substitution path that matches one root js source path among multiple roots', function () {
        const result = collectSubstitutionExports(
            {
                name: 'package-a',
                roots: {
                    main: rootWithSource('/src/index.js', 'index.js'),
                    feature: rootWithSource('/src/feature.js', 'feature.js')
                },
                contents: [content('/src/index.js', 'index.js'), content('/src/feature.js', 'feature.js')]
            },
            new Set(['/src/index.js'])
        );

        assert.deepStrictEqual(result, {});
    });

    test('throws when a substitution source path is not present in contents', function () {
        assert.throws(() => {
            collectSubstitutionExports(
                {
                    name: 'package-a',
                    roots: { main: rootWithSource('/src/index.js', 'index.js') },
                    contents: [content('/src/index.js', 'index.js')]
                },
                new Set(['/src/missing.js'])
            );
        }, /^Error: Package "package-a" is missing content for "\/src\/missing\.js"$/u);
    });
});
