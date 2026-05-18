import assert from 'node:assert';
import { suite, test } from 'mocha';
import { explicitBinTargetPaths } from './published-package.ts';

suite('published-package', function () {
    test('explicitBinTargetPaths() returns an empty set when binField is undefined', function () {
        const result = explicitBinTargetPaths({ binField: undefined });
        assert.deepStrictEqual(result, new Set<string>());
    });

    test('explicitBinTargetPaths() returns a single-entry set for a string binField', function () {
        const result = explicitBinTargetPaths({ binField: 'cli.js' });
        assert.deepStrictEqual(result, new Set(['cli.js']));
    });

    test('explicitBinTargetPaths() strips a leading "./" from a string binField', function () {
        const result = explicitBinTargetPaths({ binField: './cli.js' });
        assert.deepStrictEqual(result, new Set(['cli.js']));
    });

    test('explicitBinTargetPaths() collects target paths from a record binField', function () {
        const result = explicitBinTargetPaths({ binField: { foo: 'foo.js', bar: './bar.js' } });
        assert.deepStrictEqual(result, new Set(['foo.js', 'bar.js']));
    });

    test('explicitBinTargetPaths() ignores non-string entries in a record binField', function () {
        const result = explicitBinTargetPaths({ binField: { foo: 'foo.js', bar: undefined } });
        assert.deepStrictEqual(result, new Set(['foo.js']));
    });

    test('explicitBinTargetPaths() leaves a target path without "./" untouched', function () {
        const result = explicitBinTargetPaths({ binField: { foo: 'nested/foo.js' } });
        assert.deepStrictEqual(result, new Set(['nested/foo.js']));
    });
});
