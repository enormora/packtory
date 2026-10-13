import assert from 'node:assert';
import { suite, test } from 'mocha';
import { explicitExecutableTargetPaths } from './published-package.ts';

suite('published-package', function () {
    test('explicitExecutableTargetPaths() returns an empty set when executableField is undefined', function () {
        const result = explicitExecutableTargetPaths({ executableField: undefined });
        assert.deepStrictEqual(result, new Set<string>());
    });

    test('explicitExecutableTargetPaths() returns a single-entry set for a string executableField', function () {
        const result = explicitExecutableTargetPaths({ executableField: 'cli.js' });
        assert.deepStrictEqual(result, new Set([ 'cli.js' ]));
    });

    test('explicitExecutableTargetPaths() strips a leading "./" from a string executableField', function () {
        const result = explicitExecutableTargetPaths({ executableField: './cli.js' });
        assert.deepStrictEqual(result, new Set([ 'cli.js' ]));
    });

    test('explicitExecutableTargetPaths() collects target paths from a record executableField', function () {
        const result = explicitExecutableTargetPaths({ executableField: { foo: 'foo.js', bar: './bar.js' } });
        assert.deepStrictEqual(result, new Set([ 'foo.js', 'bar.js' ]));
    });

    test('explicitExecutableTargetPaths() ignores non-string entries in a record executableField', function () {
        const result = explicitExecutableTargetPaths({ executableField: { foo: 'foo.js', bar: undefined } });
        assert.deepStrictEqual(result, new Set([ 'foo.js' ]));
    });

    test('explicitExecutableTargetPaths() leaves a target path without "./" untouched', function () {
        const result = explicitExecutableTargetPaths({ executableField: { foo: 'nested/foo.js' } });
        assert.deepStrictEqual(result, new Set([ 'nested/foo.js' ]));
    });
});
