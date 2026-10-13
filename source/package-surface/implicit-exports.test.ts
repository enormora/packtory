import assert from 'node:assert';
import { suite, test } from 'mocha';
import { content, rootWithSource } from '../test-libraries/package-surface-fixtures.ts';
import { buildImplicitExportsField } from './implicit-exports.ts';

suite('implicit-exports', function () {
    test('combines root exports and substitution exports for the implicit branch', function () {
        const result = buildImplicitExportsField(
            {
                name: 'package-a',
                roots: { main: rootWithSource('/source/index.js', 'index.js') },
                contents: [ content('/source/index.js', 'index.js'), content('/source/public.js', 'public.js') ]
            },
            { mode: 'implicit', defaultModuleRoot: 'main' },
            new Set([ '/source/public.js' ])
        );

        assert.deepStrictEqual(result, {
            '.': { import: './index.js' },
            './public.js': { import: './public.js' }
        });
    });

    test('appends the package.json export when exportPackageManifest is true', function () {
        const result = buildImplicitExportsField(
            {
                name: 'package-a',
                exportPackageManifest: true,
                roots: { main: rootWithSource('/source/index.js', 'index.js') },
                contents: []
            },
            { mode: 'implicit', defaultModuleRoot: 'main' },
            new Set()
        );

        assert.strictEqual(result['./package.json'], './package.json');
    });
});
