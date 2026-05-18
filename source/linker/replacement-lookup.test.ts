import assert from 'node:assert';
import { suite, test } from 'mocha';
import { explicitPackageSurface } from '../package-surface/surface.ts';
import { analyzedBundleResource, linkedBundle } from '../test-libraries/bundle-fixtures.ts';
import type { BundleSubstitutionSource } from './linked-bundle.ts';
import { findAllPathReplacements } from './replacement-lookup.ts';

function exposingBundle(name: string, sourceFilePath: string, targetFilePath: string): BundleSubstitutionSource {
    const bundle = linkedBundle({
        name,
        contents: [analyzedBundleResource(sourceFilePath, { targetFilePath })],
        roots: {
            main: {
                js: { sourceFilePath, targetFilePath, content: '', isExecutable: false }
            }
        },
        surface: explicitPackageSurface({ modules: [{ root: 'main', export: '.' }] })
    });
    return bundle;
}

suite('replacement-lookup', function () {
    test('findAllPathReplacements returns no replacements when no bundle owns any of the files', function () {
        const result = findAllPathReplacements(['/x/a.ts'], []);

        assert.strictEqual(result.importPathReplacements.size, 0);
        assert.deepStrictEqual(result.bundleDependencies, []);
    });

    test('findAllPathReplacements maps each file to the public target path of the owning bundle', function () {
        const bundle = exposingBundle('pkg-b', '/b/helpers.ts', 'helpers.ts');

        const result = findAllPathReplacements(['/b/helpers.ts'], [bundle]);

        assert.strictEqual(result.importPathReplacements.get('/b/helpers.ts'), 'pkg-b');
        assert.deepStrictEqual(result.bundleDependencies, ['pkg-b']);
    });

    test('findAllPathReplacements throws when a bundle owns the file but does not expose it', function () {
        const bundle = linkedBundle({
            name: 'pkg-b',
            contents: [analyzedBundleResource('/b/internal.ts', { targetFilePath: 'internal.ts' })],
            surface: explicitPackageSurface({ modules: [{ root: 'main', export: '.' }] })
        });

        try {
            findAllPathReplacements(['/b/internal.ts'], [bundle]);
            assert.fail('expected findAllPathReplacements to throw');
        } catch (error) {
            assert.ok(error instanceof Error);
            assert.strictEqual(
                error.message,
                'Package "pkg-b" does not expose "/b/internal.ts" for cross-package substitution'
            );
        }
    });

    test('findAllPathReplacements returns one bundle dependency entry per matched file', function () {
        const bundleB = exposingBundle('pkg-b', '/b/helpers.ts', 'helpers.ts');
        const bundleC = exposingBundle('pkg-c', '/c/helpers.ts', 'helpers.ts');

        const result = findAllPathReplacements(['/b/helpers.ts', '/c/helpers.ts'], [bundleB, bundleC]);

        assert.deepStrictEqual(result.bundleDependencies, ['pkg-b', 'pkg-c']);
    });
});
