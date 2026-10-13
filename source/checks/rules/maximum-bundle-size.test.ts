import assert from 'node:assert';
import { suite, test } from 'mocha';
import { emptyCheckContext } from '../../test-libraries/check-fixtures.ts';
import type { AnalyzedBundle } from '../../dead-code-eliminator/analyzed-bundle.ts';
import { analyzedBundle, analyzedBundleResource } from '../../test-libraries/bundle-fixtures.ts';
import { maximumBundleSizeRule } from './maximum-bundle-size.ts';

function bundleWithBytes(name: string, bytes: number): AnalyzedBundle {
    return analyzedBundle({
        name,
        contents: [ analyzedBundleResource(`/${name}/index.js`, { content: 'a'.repeat(bytes) }) ]
    });
}

suite('max-bundle-size', function () {
    suite('disabled and empty settings', function () {
        test('rule definition exposes name, schemas and a run function', function () {
            assert.strictEqual(maximumBundleSizeRule.name, 'maximumBundleSize');
            assert.strictEqual(typeof maximumBundleSizeRule.run, 'function');
        });

        test('returns no issues when settings are missing', async function () {
            const result = await maximumBundleSizeRule.run({
                bundles: [ bundleWithBytes('a', 100) ],
                settings: undefined,
                ...emptyCheckContext()
            });

            assert.deepStrictEqual(result, []);
        });

        test('returns no issues when the rule is disabled', async function () {
            const result = await maximumBundleSizeRule.run({
                bundles: [ bundleWithBytes('a', 100) ],
                settings: { maximumBundleSize: { enabled: false, bytes: 10 } },
                ...emptyCheckContext()
            });

            assert.deepStrictEqual(result, []);
        });

        test('returns no issues when neither global nor per-package threshold is set', async function () {
            const result = await maximumBundleSizeRule.run({
                bundles: [ bundleWithBytes('a', 100) ],
                settings: { maximumBundleSize: { enabled: true } },
                ...emptyCheckContext()
            });

            assert.deepStrictEqual(result, []);
        });
    });

    suite('global thresholds', function () {
        test('reports a bundle exceeding the global threshold', async function () {
            const result = await maximumBundleSizeRule.run({
                bundles: [ bundleWithBytes('a', 100) ],
                settings: { maximumBundleSize: { enabled: true, bytes: 50 } },
                ...emptyCheckContext()
            });

            assert.deepStrictEqual(result, [
                'Package "a" exceeds the maximum bundle size: 100 bytes (limit: 50 bytes)'
            ]);
        });

        test('passes a bundle exactly at the threshold', async function () {
            const result = await maximumBundleSizeRule.run({
                bundles: [ bundleWithBytes('a', 100) ],
                settings: { maximumBundleSize: { enabled: true, bytes: 100 } },
                ...emptyCheckContext()
            });

            assert.deepStrictEqual(result, []);
        });
    });

    async function runWithGlobalAndOverride(globalBytes: number, override: number): Promise<readonly string[]> {
        return await maximumBundleSizeRule.run({
            bundles: [ bundleWithBytes('a', 100) ],
            settings: { maximumBundleSize: { enabled: true, bytes: globalBytes } },
            sourceFolders: new Map(),
            perPackageSettings: new Map([ [ 'a', { maximumBundleSize: { bytes: override } } ] ])
        });
    }

    test('per-package bytes overrides the global default upward', async function () {
        assert.deepStrictEqual(await runWithGlobalAndOverride(50, 1000), []);
    });

    test('per-package bytes overrides the global default downward', async function () {
        assert.deepStrictEqual(await runWithGlobalAndOverride(1000, 50), [
            'Package "a" exceeds the maximum bundle size: 100 bytes (limit: 50 bytes)'
        ]);
    });

    test('per-package bytes acts as the threshold when no global default is set', async function () {
        const result = await maximumBundleSizeRule.run({
            bundles: [ bundleWithBytes('a', 100), bundleWithBytes('b', 100) ],
            settings: { maximumBundleSize: { enabled: true } },
            sourceFolders: new Map(),
            perPackageSettings: new Map([ [ 'a', { maximumBundleSize: { bytes: 50 } } ] ])
        });

        assert.deepStrictEqual(result, [ 'Package "a" exceeds the maximum bundle size: 100 bytes (limit: 50 bytes)' ]);
    });

    test('falls back to the global default when the per-package entry has no maximumBundleSize key', async function () {
        const result = await maximumBundleSizeRule.run({
            bundles: [ bundleWithBytes('a', 100) ],
            settings: { maximumBundleSize: { enabled: true, bytes: 50 } },
            sourceFolders: new Map(),
            perPackageSettings: new Map([ [ 'a', {} ] ])
        });

        assert.deepStrictEqual(result, [ 'Package "a" exceeds the maximum bundle size: 100 bytes (limit: 50 bytes)' ]);
    });

    test('measures bundle size as the UTF-8 byte length of every resource’s content', async function () {
        const bundle = analyzedBundle({
            name: 'multi',
            contents: [
                analyzedBundleResource('/multi/a.js', { content: 'ä' }),
                analyzedBundleResource('/multi/b.js', { content: 'ab' })
            ]
        });

        const result = await maximumBundleSizeRule.run({
            bundles: [ bundle ],
            settings: { maximumBundleSize: { enabled: true, bytes: 3 } },
            ...emptyCheckContext()
        });

        assert.deepStrictEqual(result, [ 'Package "multi" exceeds the maximum bundle size: 4 bytes (limit: 3 bytes)' ]);
    });
});
