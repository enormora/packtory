import assert from 'node:assert';
import { test } from 'mocha';
import { codeResource } from '../../test-libraries/analyzed-resource-fixtures.ts';
import { collectHashImportSpecifiers } from './hash-import-scanner.ts';

test('collectHashImportSpecifiers returns an empty set when the bundle has no contents', () => {
    assert.deepStrictEqual(collectHashImportSpecifiers({ contents: [] }), new Set<string>());
});

test('collectHashImportSpecifiers returns an empty set when a code file uses no hash specifiers', () => {
    assert.deepStrictEqual(
        collectHashImportSpecifiers({ contents: [codeResource('a.js', "import './local.js';")] }),
        new Set<string>()
    );
});

test('collectHashImportSpecifiers collects a single hash specifier from a code file', () => {
    assert.deepStrictEqual(
        collectHashImportSpecifiers({ contents: [codeResource('a.js', "import '#foo';")] }),
        new Set(['#foo'])
    );
});

test('collectHashImportSpecifiers collects every distinct hash specifier across multiple files', () => {
    assert.deepStrictEqual(
        collectHashImportSpecifiers({
            contents: [codeResource('a.js', "import '#foo';"), codeResource('b.js', "import '#bar/baz';")]
        }),
        new Set(['#foo', '#bar/baz'])
    );
});

test('collectHashImportSpecifiers deduplicates a hash specifier referenced from multiple files', () => {
    assert.deepStrictEqual(
        collectHashImportSpecifiers({
            contents: [codeResource('a.js', "import '#foo';"), codeResource('b.js', "import '#foo';")]
        }),
        new Set(['#foo'])
    );
});

test('collectHashImportSpecifiers ignores hash specifiers in non-code files', () => {
    assert.deepStrictEqual(
        collectHashImportSpecifiers({ contents: [codeResource('a.md', "import '#foo';")] }),
        new Set<string>()
    );
});
