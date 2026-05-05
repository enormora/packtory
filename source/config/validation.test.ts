import assert from 'node:assert';
import { test } from 'mocha';
import { Result } from 'true-myth';
import { validateConfig, validateConfigWithoutRegistry } from './validation.ts';

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

test('returns an issue when a scoped allow-list entry references an unknown package', () => {
    const result = validateConfig({
        registrySettings: { token: 'foo' },
        commonPackageSettings: { sourcesFolder: 'foo', mainPackageJson: {} },
        checks: {
            noDuplicatedFiles: {
                enabled: true,
                allowList: [{ filePath: 'src/shared/util.ts', packages: ['a', 'ghost'] }]
            }
        },
        packages: [
            { name: 'a', entryPoints: [{ js: 'foo' }] },
            { name: 'b', entryPoints: [{ js: 'foo' }] }
        ]
    });

    assert.deepStrictEqual(
        result,
        Result.err(['Allow list entry for "src/shared/util.ts" references unknown package "ghost"'])
    );
});

test('returns one issue per unknown package in a scoped allow-list entry', () => {
    const result = validateConfig({
        registrySettings: { token: 'foo' },
        commonPackageSettings: { sourcesFolder: 'foo', mainPackageJson: {} },
        checks: {
            noDuplicatedFiles: {
                enabled: true,
                allowList: [{ filePath: 'src/shared/util.ts', packages: ['ghost', 'phantom'] }]
            }
        },
        packages: [
            { name: 'a', entryPoints: [{ js: 'foo' }] },
            { name: 'b', entryPoints: [{ js: 'foo' }] }
        ]
    });

    assert.deepStrictEqual(
        result,
        Result.err([
            'Allow list entry for "src/shared/util.ts" references unknown package "ghost"',
            'Allow list entry for "src/shared/util.ts" references unknown package "phantom"'
        ])
    );
});

test('accepts a config where checks is defined but noDuplicatedFiles is omitted', () => {
    const result = validateConfig({
        registrySettings: { token: 'foo' },
        commonPackageSettings: { sourcesFolder: 'foo', mainPackageJson: {} },
        checks: {},
        packages: [{ name: 'a', entryPoints: [{ js: 'foo' }] }]
    });

    assert.strictEqual(result.isOk, true);
});

test('accepts a config where checks.noDuplicatedFiles is defined without an allowList', () => {
    const result = validateConfig({
        registrySettings: { token: 'foo' },
        commonPackageSettings: { sourcesFolder: 'foo', mainPackageJson: {} },
        checks: { noDuplicatedFiles: { enabled: true } },
        packages: [{ name: 'a', entryPoints: [{ js: 'foo' }] }]
    });

    assert.strictEqual(result.isOk, true);
});

test('does not report unknown-package issues for plain string allow-list entries', () => {
    const result = validateConfig({
        registrySettings: { token: 'foo' },
        commonPackageSettings: { sourcesFolder: 'foo', mainPackageJson: {} },
        checks: {
            noDuplicatedFiles: {
                enabled: true,
                allowList: ['LICENSE']
            }
        },
        packages: [{ name: 'a', entryPoints: [{ js: 'foo' }] }]
    });

    assert.strictEqual(result.isOk, true);
});

test('accepts a scoped allow-list entry when all referenced packages exist', () => {
    const result = validateConfig({
        registrySettings: { token: 'foo' },
        commonPackageSettings: { sourcesFolder: 'foo', mainPackageJson: {} },
        checks: {
            noDuplicatedFiles: {
                enabled: true,
                allowList: [{ filePath: 'src/shared/util.ts', packages: ['a', 'b'] }]
            }
        },
        packages: [
            { name: 'a', entryPoints: [{ js: 'foo' }] },
            { name: 'b', entryPoints: [{ js: 'foo' }] }
        ]
    });

    assert.strictEqual(result.isOk, true);
});

test('validateConfigWithoutRegistry() returns schema issues when the config is invalid', () => {
    const result = validateConfigWithoutRegistry({ not: 'valid' });

    assert.deepStrictEqual(result, Result.err(['invalid value doesn’t match expected union']));
});

test('validateConfigWithoutRegistry() returns an issue for unknown packages in a scoped allow-list entry', () => {
    const result = validateConfigWithoutRegistry({
        commonPackageSettings: { sourcesFolder: 'foo', mainPackageJson: {} },
        checks: {
            noDuplicatedFiles: {
                enabled: true,
                allowList: [{ filePath: 'src/shared/util.ts', packages: ['a', 'ghost'] }]
            }
        },
        packages: [
            { name: 'a', entryPoints: [{ js: 'foo' }] },
            { name: 'b', entryPoints: [{ js: 'foo' }] }
        ]
    });

    assert.deepStrictEqual(
        result,
        Result.err(['Allow list entry for "src/shared/util.ts" references unknown package "ghost"'])
    );
});

test('validateConfigWithoutRegistry() returns duplicate and missing dependency issues', () => {
    const result = validateConfigWithoutRegistry({
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
