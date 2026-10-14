import assert from 'node:assert';
import { suite, test } from 'mocha';
import { duplicateMessage, hasMultipleOwners } from './duplicate-detection.ts';
import type { OwnerInformation } from './file-ownership.ts';

function owner(bundleName: string, survivingBindings: readonly string[] = []): OwnerInformation {
    return { bundleName, survivingBindings: new Set(survivingBindings) };
}

suite('duplicate-detection', function () {
    test('hasMultipleOwners returns false for fewer than two owners', function () {
        assert.strictEqual(hasMultipleOwners([]), false);
        assert.strictEqual(hasMultipleOwners([ owner('package-a') ]), false);
    });

    test('hasMultipleOwners returns true once two or more owners are present', function () {
        assert.strictEqual(hasMultipleOwners([ owner('package-a'), owner('package-b') ]), true);
    });

    test('duplicateMessage falls back to the path-level message when no owner has surviving bindings', function () {
        const message = duplicateMessage('/source/dup.ts', [ owner('package-a'), owner('package-b') ]);

        assert.strictEqual(message?.startsWith('File "/source/dup.ts" is included in multiple packages:'), true);
    });

    test('duplicateMessage returns undefined when owners have bindings but none overlap', function () {
        const message = duplicateMessage('/source/dup.ts', [
            owner('package-a', [ 'x' ]),
            owner('package-b', [ 'y' ])
        ]);

        assert.strictEqual(message, undefined);
    });

    test('duplicateMessage emits a shared-declarations message when owners share at least one binding', function () {
        const message = duplicateMessage('/source/dup.ts', [
            owner('package-a', [ 'shared' ]),
            owner('package-b', [ 'shared', 'other' ])
        ]);
        if (message === undefined) {
            assert.fail('expected a duplicate message');
        }

        assert.strictEqual(message.includes('shared declarations across multiple packages'), true);
        assert.strictEqual(message.includes('"shared"'), true);
    });
});
