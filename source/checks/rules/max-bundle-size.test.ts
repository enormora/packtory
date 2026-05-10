import assert from 'node:assert';
import { test } from 'mocha';
import type { AnalyzedBundle } from '../../dead-code-eliminator/analyzed-bundle.ts';
import { analyzedBundle, analyzedBundleResource } from '../../test-libraries/bundle-fixtures.ts';
import { maxBundleSizeRule } from './max-bundle-size.ts';

function bundleWithBytes(name: string, bytes: number): AnalyzedBundle {
    return analyzedBundle({
        name,
        contents: [analyzedBundleResource(`/${name}/index.js`, { content: 'a'.repeat(bytes) })]
    });
}

test('rule definition exposes name, schemas and a run function', () => {
    assert.strictEqual(maxBundleSizeRule.name, 'maxBundleSize');
    assert.strictEqual(typeof maxBundleSizeRule.run, 'function');
});

test('returns no issues when settings are missing', () => {
    const result = maxBundleSizeRule.run({
        bundles: [bundleWithBytes('a', 100)],
        settings: undefined,
        perPackageSettings: new Map()
    });

    assert.deepStrictEqual(result, []);
});

test('returns no issues when the rule is disabled', () => {
    const result = maxBundleSizeRule.run({
        bundles: [bundleWithBytes('a', 100)],
        settings: { maxBundleSize: { enabled: false, bytes: 10 } },
        perPackageSettings: new Map()
    });

    assert.deepStrictEqual(result, []);
});

test('returns no issues when neither global nor per-package threshold is set', () => {
    const result = maxBundleSizeRule.run({
        bundles: [bundleWithBytes('a', 100)],
        settings: { maxBundleSize: { enabled: true } },
        perPackageSettings: new Map()
    });

    assert.deepStrictEqual(result, []);
});

test('reports a bundle exceeding the global threshold', () => {
    const result = maxBundleSizeRule.run({
        bundles: [bundleWithBytes('a', 100)],
        settings: { maxBundleSize: { enabled: true, bytes: 50 } },
        perPackageSettings: new Map()
    });

    assert.deepStrictEqual(result, ['Package "a" exceeds the maximum bundle size: 100 bytes (limit: 50 bytes)']);
});

test('passes a bundle exactly at the threshold', () => {
    const result = maxBundleSizeRule.run({
        bundles: [bundleWithBytes('a', 100)],
        settings: { maxBundleSize: { enabled: true, bytes: 100 } },
        perPackageSettings: new Map()
    });

    assert.deepStrictEqual(result, []);
});

function runWithGlobalAndOverride(globalBytes: number, override: number): readonly string[] {
    return maxBundleSizeRule.run({
        bundles: [bundleWithBytes('a', 100)],
        settings: { maxBundleSize: { enabled: true, bytes: globalBytes } },
        perPackageSettings: new Map([['a', { maxBundleSize: { bytes: override } }]])
    });
}

test('per-package bytes overrides the global default upward', () => {
    assert.deepStrictEqual(runWithGlobalAndOverride(50, 1000), []);
});

test('per-package bytes overrides the global default downward', () => {
    assert.deepStrictEqual(runWithGlobalAndOverride(1000, 50), [
        'Package "a" exceeds the maximum bundle size: 100 bytes (limit: 50 bytes)'
    ]);
});

test('per-package bytes acts as the threshold when no global default is set', () => {
    const result = maxBundleSizeRule.run({
        bundles: [bundleWithBytes('a', 100), bundleWithBytes('b', 100)],
        settings: { maxBundleSize: { enabled: true } },
        perPackageSettings: new Map([['a', { maxBundleSize: { bytes: 50 } }]])
    });

    assert.deepStrictEqual(result, ['Package "a" exceeds the maximum bundle size: 100 bytes (limit: 50 bytes)']);
});

test('falls back to the global default when the per-package entry has no maxBundleSize key', () => {
    const result = maxBundleSizeRule.run({
        bundles: [bundleWithBytes('a', 100)],
        settings: { maxBundleSize: { enabled: true, bytes: 50 } },
        perPackageSettings: new Map([['a', {}]])
    });

    assert.deepStrictEqual(result, ['Package "a" exceeds the maximum bundle size: 100 bytes (limit: 50 bytes)']);
});

test('measures bundle size as the UTF-8 byte length of every resource’s content', () => {
    const bundle = analyzedBundle({
        name: 'multi',
        contents: [
            analyzedBundleResource('/multi/a.js', { content: 'ä' }),
            analyzedBundleResource('/multi/b.js', { content: 'ab' })
        ]
    });

    const result = maxBundleSizeRule.run({
        bundles: [bundle],
        settings: { maxBundleSize: { enabled: true, bytes: 3 } },
        perPackageSettings: new Map()
    });

    assert.deepStrictEqual(result, ['Package "multi" exceeds the maximum bundle size: 4 bytes (limit: 3 bytes)']);
});
