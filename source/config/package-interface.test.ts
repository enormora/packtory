import assert from 'node:assert';
import { suite, test } from 'mocha';
import { safeParse } from '@schema-hub/zod-error-formatter';
import { packageInterfaceSchema } from './package-interface.ts';

suite('package-interface', function () {
    test('packageInterfaceSchema accepts root exports for "." and subpath exports', function () {
        assert.strictEqual(
            safeParse(packageInterfaceSchema, {
                modules: [
                    { root: 'main', export: '.' },
                    { root: 'feature', export: './feature' }
                ],
                privateRoots: ['worker']
            }).success,
            true
        );
    });

    test('packageInterfaceSchema rejects module export keys without a package-relative prefix', function () {
        assert.strictEqual(
            safeParse(packageInterfaceSchema, {
                modules: [{ root: 'main', export: 'feature' }]
            }).success,
            false
        );
    });

    test('packageInterfaceSchema rejects empty module and bin exposure arrays', function () {
        assert.strictEqual(
            safeParse(packageInterfaceSchema, {
                modules: []
            }).success,
            false
        );
        assert.strictEqual(
            safeParse(packageInterfaceSchema, {
                bins: []
            }).success,
            false
        );
        assert.strictEqual(
            safeParse(packageInterfaceSchema, {
                modules: [{ root: 'main', export: '.' }],
                privateRoots: []
            }).success,
            false
        );
    });
});
