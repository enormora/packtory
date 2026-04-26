import assert from 'node:assert';
import { test } from 'mocha';
import { Result } from 'true-myth';
import { validateConfig } from './validation.ts';

test('returns the issues when the given config doesn’t match the schema', () => {
    const result = validateConfig({ not: 'valid' });
    assert.deepStrictEqual(
        result,
        Result.err(['at registrySettings: missing property', 'invalid value doesn’t match expected union'])
    );
});

test('returns an issue when a package with the same name exists twice', () => {
    const result = validateConfig({
        registrySettings: { token: 'foo' },
        commonPackageSettings: { sourcesFolder: 'foo', mainPackageJson: {} },
        packages: [
            { name: 'foo', entryPoints: [{ js: 'foo' }] },
            { name: 'foo', entryPoints: [{ js: 'foo' }] }
        ]
    });

    assert.deepStrictEqual(result, Result.err(['Duplicate package definition with the name "foo"']));
});

test('returns two issues when packages with the same name exists thrice', () => {
    const result = validateConfig({
        registrySettings: { token: 'foo' },
        commonPackageSettings: { sourcesFolder: 'foo', mainPackageJson: {} },
        packages: [
            { name: 'foo', entryPoints: [{ js: 'foo' }] },
            { name: 'foo', entryPoints: [{ js: 'foo' }] },
            { name: 'foo', entryPoints: [{ js: 'foo' }] }
        ]
    });

    assert.deepStrictEqual(
        result,
        Result.err([
            'Duplicate package definition with the name "foo"',
            'Duplicate package definition with the name "foo"'
        ])
    );
});

test('returns two issues when there are two duplicated package names', () => {
    const result = validateConfig({
        registrySettings: { token: 'foo' },
        commonPackageSettings: { sourcesFolder: 'foo', mainPackageJson: {} },
        packages: [
            { name: 'foo', entryPoints: [{ js: 'foo' }] },
            { name: 'foo', entryPoints: [{ js: 'foo' }] },
            { name: 'bar', entryPoints: [{ js: 'foo' }] },
            { name: 'bar', entryPoints: [{ js: 'foo' }] }
        ]
    });

    assert.deepStrictEqual(
        result,
        Result.err([
            'Duplicate package definition with the name "foo"',
            'Duplicate package definition with the name "bar"'
        ])
    );
});

test('returns an issue when there is a cycle per bundleDependencies', () => {
    const result = validateConfig({
        registrySettings: { token: 'foo' },
        commonPackageSettings: { sourcesFolder: 'foo', mainPackageJson: {} },
        packages: [
            { name: 'a', entryPoints: [{ js: 'foo' }], bundleDependencies: ['b'] },
            { name: 'b', entryPoints: [{ js: 'foo' }], bundleDependencies: ['a'] }
        ]
    });

    assert.deepStrictEqual(result, Result.err(['Unexpected cyclic dependency path: [a→b→a]']));
});

test('returns an issue when there is a long cycle per bundleDependencies', () => {
    const result = validateConfig({
        registrySettings: { token: 'foo' },
        commonPackageSettings: { sourcesFolder: 'foo', mainPackageJson: {} },
        packages: [
            { name: 'a', entryPoints: [{ js: 'foo' }], bundleDependencies: ['d'] },
            { name: 'b', entryPoints: [{ js: 'foo' }], bundleDependencies: ['a'] },
            { name: 'c', entryPoints: [{ js: 'foo' }], bundleDependencies: ['b'] },
            { name: 'd', entryPoints: [{ js: 'foo' }], bundleDependencies: ['c'] }
        ]
    });

    assert.deepStrictEqual(result, Result.err(['Unexpected cyclic dependency path: [a→d→c→b→a]']));
});

test('returns an issue when there is a cycle per bundlePeerDependencies', () => {
    const result = validateConfig({
        registrySettings: { token: 'foo' },
        commonPackageSettings: { sourcesFolder: 'foo', mainPackageJson: {} },
        packages: [
            { name: 'a', entryPoints: [{ js: 'foo' }], bundlePeerDependencies: ['b'] },
            { name: 'b', entryPoints: [{ js: 'foo' }], bundlePeerDependencies: ['a'] }
        ]
    });

    assert.deepStrictEqual(result, Result.err(['Unexpected cyclic dependency path: [a→b→a]']));
});

test('returns an issue when there is a cycle per bundleDependencies and bundlePeerDependencies', () => {
    const result = validateConfig({
        registrySettings: { token: 'foo' },
        commonPackageSettings: { sourcesFolder: 'foo', mainPackageJson: {} },
        packages: [
            { name: 'a', entryPoints: [{ js: 'foo' }], bundleDependencies: ['b'] },
            { name: 'b', entryPoints: [{ js: 'foo' }], bundlePeerDependencies: ['a'] }
        ]
    });

    assert.deepStrictEqual(result, Result.err(['Unexpected cyclic dependency path: [a→b→a]']));
});

test('returns an issue when a package depends on itself', () => {
    const result = validateConfig({
        registrySettings: { token: 'foo' },
        commonPackageSettings: { sourcesFolder: 'foo', mainPackageJson: {} },
        packages: [{ name: 'a', entryPoints: [{ js: 'foo' }], bundleDependencies: ['a'] }]
    });

    assert.deepStrictEqual(result, Result.err(['Unexpected cyclic dependency path: [a→a]']));
});

test('returns an issue when a package bundle dependency does not exit', () => {
    const result = validateConfig({
        registrySettings: { token: 'foo' },
        commonPackageSettings: { sourcesFolder: 'foo', mainPackageJson: {} },
        packages: [{ name: 'a', entryPoints: [{ js: 'foo' }], bundleDependencies: ['b'] }]
    });

    assert.deepStrictEqual(result, Result.err(['Bundle dependency "b" referenced in "a" does not exist']));
});

test('returns an issue when a package bundle peer dependency does not exit', () => {
    const result = validateConfig({
        registrySettings: { token: 'foo' },
        commonPackageSettings: { sourcesFolder: 'foo', mainPackageJson: {} },
        packages: [{ name: 'a', entryPoints: [{ js: 'foo' }], bundlePeerDependencies: ['b'] }]
    });

    assert.deepStrictEqual(result, Result.err(['Bundle peer dependency "b" referenced in "a" does not exist']));
});

test('returns multiple issues of different kind', () => {
    const result = validateConfig({
        registrySettings: { token: 'foo' },
        commonPackageSettings: { sourcesFolder: 'foo', mainPackageJson: {} },
        packages: [
            { name: 'a', entryPoints: [{ js: 'foo' }], bundleDependencies: ['b'] },
            { name: 'b', entryPoints: [{ js: 'foo' }], bundleDependencies: ['a'] },
            { name: 'foo', entryPoints: [{ js: 'foo' }] },
            { name: 'foo', entryPoints: [{ js: 'foo' }] }
        ]
    });

    assert.deepStrictEqual(
        result,
        Result.err(['Duplicate package definition with the name "foo"', 'Unexpected cyclic dependency path: [a→b→a]'])
    );
});

test('returns a missing dependency and duplicate package issue at the same time', () => {
    const result = validateConfig({
        registrySettings: { token: 'foo' },
        commonPackageSettings: { sourcesFolder: 'foo', mainPackageJson: {} },
        packages: [
            { name: 'a', entryPoints: [{ js: 'foo' }], bundlePeerDependencies: ['b'] },
            { name: 'c', entryPoints: [{ js: 'foo' }] },
            { name: 'c', entryPoints: [{ js: 'foo' }] }
        ]
    });

    assert.deepStrictEqual(
        result,
        Result.err([
            'Duplicate package definition with the name "c"',
            'Bundle peer dependency "b" referenced in "a" does not exist'
        ])
    );
});

test('doesn’t report cyclic dependency issues when there is also a missing dependency', () => {
    const result = validateConfig({
        registrySettings: { token: 'foo' },
        commonPackageSettings: { sourcesFolder: 'foo', mainPackageJson: {} },
        packages: [
            { name: 'a', entryPoints: [{ js: 'foo' }], bundlePeerDependencies: ['b'] },
            { name: 'c', entryPoints: [{ js: 'foo' }], bundlePeerDependencies: ['c'] }
        ]
    });

    assert.deepStrictEqual(result, Result.err(['Bundle peer dependency "b" referenced in "a" does not exist']));
});
