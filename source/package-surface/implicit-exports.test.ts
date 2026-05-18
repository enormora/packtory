import assert from 'node:assert';
import { suite, test } from 'mocha';
import { content, rootWithSource } from '../test-libraries/package-surface-fixtures.ts';
import { buildImplicitExportsField } from './implicit-exports.ts';

suite('implicit-exports', function () {
    test('combines root exports and substitution exports for the implicit branch', function () {
        const result = buildImplicitExportsField(
            {
                name: 'package-a',
                roots: { main: rootWithSource('/src/index.js', 'index.js') },
                contents: [content('/src/index.js', 'index.js'), content('/src/public.js', 'public.js')]
            },
            { mode: 'implicit', defaultModuleRoot: 'main' },
            new Set(['/src/public.js'])
        );

        assert.deepStrictEqual(result, {
            '.': { import: './index.js' },
            './public.js': { import: './public.js' }
        });
    });

    test('appends the package.json export when exportPackageJson is true', function () {
        const result = buildImplicitExportsField(
            {
                name: 'package-a',
                exportPackageJson: true,
                roots: { main: rootWithSource('/src/index.js', 'index.js') },
                contents: []
            },
            { mode: 'implicit', defaultModuleRoot: 'main' },
            new Set()
        );

        assert.strictEqual(result['./package.json'], './package.json');
    });
});
