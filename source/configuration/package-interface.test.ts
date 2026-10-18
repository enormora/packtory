import assert from 'node:assert';
import { suite, test } from 'mocha';
import { safeParse } from '../common/schema-validation.ts';
import { packageInterfaceSchema } from './package-interface.ts';

suite('package-interface', function () {
    test('packageInterfaceSchema accepts root exports for "." and subpath exports', function () {
        assert.strictEqual(
            safeParse(packageInterfaceSchema, {
                modules: [
                    { root: 'main', export: '.' },
                    { root: 'feature', export: './feature' }
                ],
                privateRoots: [ 'worker' ]
            })
                .success,
            true
        );
    });

    test('packageInterfaceSchema accepts interfaces that expose only executables', function () {
        assert.strictEqual(
            safeParse(packageInterfaceSchema, {
                executables: [ { root: 'commandLineInterface', name: 'packtory' } ]
            })
                .success,
            true
        );
    });

    test('packageInterfaceSchema rejects module export keys without a package-relative prefix', function () {
        assert.strictEqual(
            safeParse(packageInterfaceSchema, {
                modules: [ { root: 'main', export: 'feature' } ]
            })
                .success,
            false
        );
    });

    test('packageInterfaceSchema rejects empty module and bin exposure arrays', function () {
        assert.strictEqual(
            safeParse(packageInterfaceSchema, {
                modules: []
            })
                .success,
            false
        );
        assert.strictEqual(
            safeParse(packageInterfaceSchema, {
                executables: []
            })
                .success,
            false
        );
        assert.strictEqual(
            safeParse(packageInterfaceSchema, {
                modules: [ { root: 'main', export: '.' } ],
                privateRoots: []
            })
                .success,
            false
        );
        assert.strictEqual(
            safeParse(packageInterfaceSchema, {
                privateRoots: [ 'worker' ]
            })
                .success,
            false
        );
    });
});
