import assert from 'node:assert';
import { suite, test } from 'mocha';
import { findMatchingImportEntryKey } from './imports-key-matcher.ts';

suite('imports-key-matcher', function () {
    test('findMatchingImportEntryKey returns undefined when the imports field is empty', function () {
        assert.strictEqual(findMatchingImportEntryKey('#foo', {}), undefined);
    });

    test('findMatchingImportEntryKey returns undefined when no entry matches the specifier', function () {
        assert.strictEqual(findMatchingImportEntryKey('#foo', { '#bar': './bar.js' }), undefined);
    });

    test('findMatchingImportEntryKey returns the exact key when one matches the specifier verbatim', function () {
        assert.strictEqual(findMatchingImportEntryKey('#foo', { '#foo': './foo.js' }), '#foo');
    });

    test('findMatchingImportEntryKey returns the wildcard key when the specifier matches its pattern', function () {
        assert.strictEqual(findMatchingImportEntryKey('#foo/bar', { '#foo/*': './foo/*.js' }), '#foo/*');
    });

    test('findMatchingImportEntryKey prefers the longer wildcard key when several patterns match', function () {
        assert.strictEqual(
            findMatchingImportEntryKey('#foo/bar/baz', { '#foo/*': './foo/*.js', '#foo/bar/*': './foo/bar/*.js' }),
            '#foo/bar/*'
        );
    });

    test('findMatchingImportEntryKey prefers an exact key over wildcard keys that also match', function () {
        assert.strictEqual(findMatchingImportEntryKey('#foo', { '#*': './*.js', '#foo': './foo.js' }), '#foo');
    });

    test('findMatchingImportEntryKey prefers an exact key over wildcards regardless of insertion order', function () {
        assert.strictEqual(findMatchingImportEntryKey('#foo', { '#foo': './foo.js', '#*': './*.js' }), '#foo');
    });

    test('findMatchingImportEntryKey prefers an exact key over a longer wildcard that also matches', function () {
        assert.strictEqual(findMatchingImportEntryKey('#a', { '#a*': './long.js', '#a': './exact.js' }), '#a');
    });

    test('findMatchingImportEntryKey prefers an exact key listed before a longer wildcard that also matches', function () {
        assert.strictEqual(findMatchingImportEntryKey('#a', { '#a': './exact.js', '#a*': './long.js' }), '#a');
    });

    test('findMatchingImportEntryKey prefers the longer wildcard when neither matches the specifier exactly and the longer one is listed first', function () {
        assert.strictEqual(
            findMatchingImportEntryKey('#foo/bar/baz', { '#foo/bar/*': './long.js', '#foo/*': './short.js' }),
            '#foo/bar/*'
        );
    });
});
