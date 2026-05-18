import assert from 'node:assert';
import { test } from 'mocha';
import { explicitBinTargetPaths } from './published-package.ts';

test('explicitBinTargetPaths() returns an empty set when binField is undefined', () => {
    const result = explicitBinTargetPaths({ binField: undefined });
    assert.deepStrictEqual(result, new Set<string>());
});

test('explicitBinTargetPaths() returns a single-entry set for a string binField', () => {
    const result = explicitBinTargetPaths({ binField: 'cli.js' });
    assert.deepStrictEqual(result, new Set(['cli.js']));
});

test('explicitBinTargetPaths() strips a leading "./" from a string binField', () => {
    const result = explicitBinTargetPaths({ binField: './cli.js' });
    assert.deepStrictEqual(result, new Set(['cli.js']));
});

test('explicitBinTargetPaths() collects target paths from a record binField', () => {
    const result = explicitBinTargetPaths({ binField: { foo: 'foo.js', bar: './bar.js' } });
    assert.deepStrictEqual(result, new Set(['foo.js', 'bar.js']));
});

test('explicitBinTargetPaths() ignores non-string entries in a record binField', () => {
    const result = explicitBinTargetPaths({ binField: { foo: 'foo.js', bar: undefined } });
    assert.deepStrictEqual(result, new Set(['foo.js']));
});

test('explicitBinTargetPaths() leaves a target path without "./" untouched', () => {
    const result = explicitBinTargetPaths({ binField: { foo: 'nested/foo.js' } });
    assert.deepStrictEqual(result, new Set(['nested/foo.js']));
});
