import assert from 'node:assert';
import { suite, test } from 'mocha';
import { plainRoot, rootWithDeclaration } from '../test-libraries/package-surface-fixtures.ts';
import { buildImplicitRootExports } from './implicit-root-exports.ts';

suite('implicit-root-exports', function () {
    test('maps the default root to "."', function () {
        const result = buildImplicitRootExports(
            { name: 'package-a', roots: { main: plainRoot('index.js') } },
            { mode: 'implicit', defaultModuleRoot: 'main' }
        );

        assert.deepStrictEqual(result['.'], { import: './index.js' });
    });

    test('includes types alongside the import when the default root has a declaration', function () {
        const result = buildImplicitRootExports(
            { name: 'package-a', roots: { main: rootWithDeclaration('', 'index.js', '', 'index.d.ts') } },
            { mode: 'implicit', defaultModuleRoot: 'main' }
        );

        assert.deepStrictEqual(result['.'], { import: './index.js', types: './index.d.ts' });
    });

    test('maps a non-default root to "./<targetFilePath>"', function () {
        const result = buildImplicitRootExports(
            { name: 'package-a', roots: { main: plainRoot('index.js'), helper: plainRoot('helper.js') } },
            { mode: 'implicit', defaultModuleRoot: 'main' }
        );

        assert.deepStrictEqual(result['./helper.js'], { import: './helper.js' });
    });

    test('does not duplicate the default root under its target file path', function () {
        const result = buildImplicitRootExports(
            { name: 'package-a', roots: { main: plainRoot('index.js') } },
            { mode: 'implicit', defaultModuleRoot: 'main' }
        );

        assert.strictEqual(Object.hasOwn(result, './index.js'), false);
    });

    test('throws when the default root id does not exist', function () {
        assert.throws(function () {
            buildImplicitRootExports(
                { name: 'package-a', roots: { main: plainRoot('index.js') } },
                { mode: 'implicit', defaultModuleRoot: 'missing' }
            );
        }, /^Error: Package "package-a" references unknown root "missing"$/u);
    });
});
