import assert from 'node:assert';
import { suite, test } from 'mocha';
import { bundleResource } from '../test-libraries/bundle-fixtures.ts';
import { buildResolvedRoots } from './bundle-resource-lookup.ts';

const javaScriptResource = bundleResource('/source/index.ts', { targetFilePath: 'index.js' });
const declarationResource = bundleResource('/source/index.d.ts', { targetFilePath: 'index.d.ts' });

suite('bundle-resource-lookup', function () {
    test('buildResolvedRoots returns one entry per declared root', function () {
        const normalized = {
            roots: {
                main: { javaScript: '/source/index.ts' }
            },
            surface: undefined as never
        };

        const result = buildResolvedRoots(normalized, [ javaScriptResource ]);

        assert.deepStrictEqual(Object.keys(result), [ 'main' ]);
    });

    test('buildResolvedRoots attaches the matching declaration file when one is declared', function () {
        const normalized = {
            roots: {
                main: { javaScript: '/source/index.ts', declarationFile: '/source/index.d.ts' }
            },
            surface: undefined as never
        };

        const result = buildResolvedRoots(normalized, [ javaScriptResource, declarationResource ]);

        assert.strictEqual(result.main?.declarationFile?.inputFilePath, '/source/index.d.ts');
    });

    test('buildResolvedRoots leaves declarationFile undefined when none is declared', function () {
        const normalized = {
            roots: {
                main: { javaScript: '/source/index.ts' }
            },
            surface: undefined as never
        };

        const result = buildResolvedRoots(normalized, [ javaScriptResource ]);

        assert.strictEqual(result.main?.declarationFile, undefined);
    });

    test('buildResolvedRoots throws when no resource exposes the declared js path', function () {
        const normalized = {
            roots: {
                main: { javaScript: '/source/missing.ts' }
            },
            surface: undefined as never
        };

        try {
            buildResolvedRoots(normalized, [ javaScriptResource ]);
            assert.fail('expected buildResolvedRoots to throw');
        } catch (error) {
            assert.ok(error instanceof Error);
            assert.strictEqual(error.message, 'Failed to resolve resource for root /source/missing.ts');
        }
    });
});
