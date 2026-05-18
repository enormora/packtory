import assert from 'node:assert';
import { test } from 'mocha';
import { codeResource } from '../../test-libraries/analyzed-resource-fixtures.ts';
import { buildImportsField } from './versioned-bundle-imports.ts';

test('buildImportsField returns undefined when no surviving #imports specifiers are referenced', () => {
    assert.strictEqual(buildImportsField({ contents: [] }, { type: 'module' }), undefined);
});

test('buildImportsField returns only the configured imports entries that are referenced by surviving code', () => {
    assert.deepStrictEqual(
        buildImportsField(
            { contents: [codeResource('a.js', "import '#used';")] },
            {
                type: 'module',
                imports: { '#used': './used.js', '#unused': './unused.js' }
            }
        ),
        { '#used': './used.js' }
    );
});

test('buildImportsField picks the most specific wildcard imports entry for a specifier', () => {
    assert.deepStrictEqual(
        buildImportsField(
            { contents: [codeResource('a.js', "import '#foo/bar';")] },
            {
                type: 'module',
                imports: { '#foo/*': './foo/*.js', '#foo/bar/*': './foo/bar/*.js' }
            }
        ),
        { '#foo/*': './foo/*.js' }
    );
});

test('buildImportsField throws when surviving #imports exist but mainPackageJson.imports is missing', () => {
    try {
        buildImportsField({ contents: [codeResource('a.js', "import '#foo';")] }, { type: 'module' });
        assert.fail('Expected buildImportsField() to throw but it did not');
    } catch (error: unknown) {
        assert.strictEqual(
            (error as Error).message,
            'Found surviving package.json imports specifier "#foo" but mainPackageJson.imports is not configured'
        );
    }
});

test('buildImportsField throws when a surviving specifier has no matching imports entry', () => {
    try {
        buildImportsField(
            { contents: [codeResource('a.js', "import '#foo/bar';")] },
            { type: 'module', imports: { '#baz': './baz.js' } }
        );
        assert.fail('Expected buildImportsField() to throw but it did not');
    } catch (error: unknown) {
        assert.strictEqual(
            (error as Error).message,
            'Found surviving package.json imports specifier "#foo/bar" but no matching mainPackageJson.imports entry'
        );
    }
});

test('buildImportsField throws when the matching imports entry is explicitly undefined', () => {
    try {
        buildImportsField(
            { contents: [codeResource('a.js', "import '#foo';")] },
            { type: 'module', imports: { '#foo': undefined } as unknown as Record<string, never> }
        );
        assert.fail('Expected buildImportsField() to throw but it did not');
    } catch (error: unknown) {
        assert.strictEqual(
            (error as Error).message,
            'Found surviving package.json imports specifier "#foo" but matching mainPackageJson.imports entry "#foo" is undefined'
        );
    }
});
