import assert from 'node:assert';
import { suite, test } from 'mocha';
import { applyPrefixToVendorEntry, validateVendorEntrySource } from './vendor-entry.ts';

suite('vendor-entry', function () {
    test('prepends the supplied prefix to the target relative path while preserving the other fields', function () {
        const prefixed = applyPrefixToVendorEntry('package', {
            sourceAbsolutePath: '/source/index.js',
            sourcePackageRootPath: '/source',
            targetRelativePath: 'node_modules/package/index.js',
            isExecutable: true
        });

        assert.deepStrictEqual(prefixed, {
            sourceAbsolutePath: '/source/index.js',
            sourcePackageRootPath: '/source',
            targetRelativePath: 'package/node_modules/package/index.js',
            isExecutable: true
        });
    });

    test('accepts a vendored source path that resolves to the package root itself', async function () {
        let requestedPath = '';

        await validateVendorEntrySource(
            {
                async getRealPath(path) {
                    requestedPath = path;
                    return '/source';
                }
            },
            {
                sourceAbsolutePath: '/source',
                sourcePackageRootPath: '/source',
                targetRelativePath: 'node_modules/package',
                isExecutable: true
            }
        );

        assert.strictEqual(requestedPath, '/source');
    });

    test('rejects a vendored source path that resolves outside the package root', async function () {
        await assert.rejects(
            async function () {
                await validateVendorEntrySource(
                    {
                        async getRealPath() {
                            return '/source/package-other/index.js';
                        }
                    },
                    {
                        sourceAbsolutePath: '/source/package/index.js',
                        sourcePackageRootPath: '/source/package',
                        targetRelativePath: 'node_modules/package/index.js',
                        isExecutable: false
                    }
                );
            },
            {
                message: 'Vendored file "/source/package/index.js" resolved outside package root "/source/package"'
            }
        );
    });
});
