import assert from 'node:assert';
import { suite, test } from 'mocha';
import { bundleResource } from '../test-libraries/bundle-fixtures.ts';
import { buildResolvedRoots } from './bundle-resource-lookup.ts';

const jsResource = bundleResource('/src/index.ts', { targetFilePath: 'index.js' });
const dtsResource = bundleResource('/src/index.d.ts', { targetFilePath: 'index.d.ts' });

suite('bundle-resource-lookup', function () {
    test('buildResolvedRoots returns one entry per declared root', function () {
        const normalized = {
            roots: {
                main: { js: '/src/index.ts' }
            },
            surface: undefined as never
        };

        const result = buildResolvedRoots(normalized, [ jsResource ]);

        assert.deepStrictEqual(Object.keys(result), [ 'main' ]);
    });

    test('buildResolvedRoots attaches the matching declaration file when one is declared', function () {
        const normalized = {
            roots: {
                main: { js: '/src/index.ts', declarationFile: '/src/index.d.ts' }
            },
            surface: undefined as never
        };

        const result = buildResolvedRoots(normalized, [ jsResource, dtsResource ]);

        assert.strictEqual(result.main?.declarationFile?.sourceFilePath, '/src/index.d.ts');
    });

    test('buildResolvedRoots leaves declarationFile undefined when none is declared', function () {
        const normalized = {
            roots: {
                main: { js: '/src/index.ts' }
            },
            surface: undefined as never
        };

        const result = buildResolvedRoots(normalized, [ jsResource ]);

        assert.strictEqual(result.main?.declarationFile, undefined);
    });

    test('buildResolvedRoots throws when no resource exposes the declared js path', function () {
        const normalized = {
            roots: {
                main: { js: '/src/missing.ts' }
            },
            surface: undefined as never
        };

        try {
            buildResolvedRoots(normalized, [ jsResource ]);
            assert.fail('expected buildResolvedRoots to throw');
        } catch (error) {
            assert.ok(error instanceof Error);
            assert.strictEqual(error.message, 'Failed to resolve resource for root /src/missing.ts');
        }
    });
});
