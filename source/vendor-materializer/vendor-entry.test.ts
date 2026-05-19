import assert from 'node:assert';
import { suite, test } from 'mocha';
import { applyPrefixToVendorEntry } from './vendor-entry.ts';

suite('applyPrefixToVendorEntry', function () {
    test('prepends the supplied prefix to the target relative path while preserving the other fields', function () {
        const prefixed = applyPrefixToVendorEntry('package', {
            sourceAbsolutePath: '/src/index.js',
            targetRelativePath: 'node_modules/pkg/index.js',
            isExecutable: true
        });

        assert.deepStrictEqual(prefixed, {
            sourceAbsolutePath: '/src/index.js',
            targetRelativePath: 'package/node_modules/pkg/index.js',
            isExecutable: true
        });
    });
});
