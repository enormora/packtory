import assert from 'node:assert';
import { test } from 'mocha';
import { safeParse } from '@schema-hub/zod-error-formatter';
import { packageInterfaceSchema } from './package-interface.ts';

test('packageInterfaceSchema accepts root exports for "." and subpath exports', () => {
    assert.strictEqual(
        safeParse(packageInterfaceSchema, {
            modules: [
                { root: 'main', export: '.' },
                { root: 'feature', export: './feature' }
            ]
        }).success,
        true
    );
});

test('packageInterfaceSchema rejects module export keys without a package-relative prefix', () => {
    assert.strictEqual(
        safeParse(packageInterfaceSchema, {
            modules: [{ root: 'main', export: 'feature' }]
        }).success,
        false
    );
});

test('packageInterfaceSchema rejects empty module and bin exposure arrays', () => {
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
});
