import assert from 'node:assert';
import { suite, test } from 'mocha';
import { duplicateMessage, hasMultipleOwners } from './duplicate-detection.ts';
import type { OwnerInfo } from './file-ownership.ts';

function owner(bundleName: string, survivingBindings: readonly string[] = []): OwnerInfo {
    return { bundleName, survivingBindings: new Set(survivingBindings) };
}

suite('duplicate-detection', function () {
    test('hasMultipleOwners returns false for fewer than two owners', function () {
        assert.strictEqual(hasMultipleOwners([]), false);
        assert.strictEqual(hasMultipleOwners([owner('pkg-a')]), false);
    });

    test('hasMultipleOwners returns true once two or more owners are present', function () {
        assert.strictEqual(hasMultipleOwners([owner('pkg-a'), owner('pkg-b')]), true);
    });

    test('duplicateMessage falls back to the path-level message when no owner has surviving bindings', function () {
        const message = duplicateMessage('/src/dup.ts', [owner('pkg-a'), owner('pkg-b')]);

        assert.ok(message?.startsWith('File "/src/dup.ts" is included in multiple packages:'));
    });

    test('duplicateMessage returns undefined when owners have bindings but none overlap', function () {
        const message = duplicateMessage('/src/dup.ts', [owner('pkg-a', ['x']), owner('pkg-b', ['y'])]);

        assert.strictEqual(message, undefined);
    });

    test('duplicateMessage emits a shared-declarations message when owners share at least one binding', function () {
        const message = duplicateMessage('/src/dup.ts', [
            owner('pkg-a', ['shared']),
            owner('pkg-b', ['shared', 'other'])
        ]);

        assert.ok(message?.includes('shared declarations across multiple packages'));
        assert.ok(message?.includes('"shared"'));
    });
});
