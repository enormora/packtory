import assert from 'node:assert';
import { suite, test } from 'mocha';
import { applyPrefixToVendorEntry, validateVendorEntrySource } from './vendor-entry.ts';

suite('vendor-entry', function () {
    test('prepends the supplied prefix to the target relative path while preserving the other fields', function () {
        const prefixed = applyPrefixToVendorEntry('package', {
            sourceAbsolutePath: '/src/index.js',
            sourcePackageRootPath: '/src',
            targetRelativePath: 'node_modules/pkg/index.js',
            isExecutable: true
        });

        assert.deepStrictEqual(prefixed, {
            sourceAbsolutePath: '/src/index.js',
            sourcePackageRootPath: '/src',
            targetRelativePath: 'package/node_modules/pkg/index.js',
            isExecutable: true
        });
    });

    test('accepts a vendored source path that resolves to the package root itself', async function () {
        let requestedPath = '';

        await validateVendorEntrySource(
            {
                async getRealPath(path) {
                    requestedPath = path;
                    return '/src';
                }
            },
            {
                sourceAbsolutePath: '/src',
                sourcePackageRootPath: '/src',
                targetRelativePath: 'node_modules/pkg',
                isExecutable: true
            }
        );

        assert.strictEqual(requestedPath, '/src');
    });

    test('rejects a vendored source path that resolves outside the package root', async function () {
        await assert.rejects(
            async function () {
                await validateVendorEntrySource(
                    {
                        async getRealPath() {
                            return '/src/pkg-other/index.js';
                        }
                    },
                    {
                        sourceAbsolutePath: '/src/pkg/index.js',
                        sourcePackageRootPath: '/src/pkg',
                        targetRelativePath: 'node_modules/pkg/index.js',
                        isExecutable: false
                    }
                );
            },
            {
                message: 'Vendored file "/src/pkg/index.js" resolved outside package root "/src/pkg"'
            }
        );
    });
});
