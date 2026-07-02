import assert from 'node:assert';
import { suite, test } from 'mocha';
import { isExecutableFileMode } from './permissions.ts';

suite('permissions', function () {
    suite('mode bits', function () {
        test('returns false when the given mode is invalid', function () {
            const result = isExecutableFileMode(-1);
            assert.strictEqual(result, false);
        });

        test('returns false when the given mode is not executable at all', function () {
            const result = isExecutableFileMode(420);
            assert.strictEqual(result, false);
        });

        test('returns false when the given mode is only executable for the user', function () {
            const result = isExecutableFileMode(484);
            assert.strictEqual(result, false);
        });

        test('returns false when the given mode is only executable for the group', function () {
            const result = isExecutableFileMode(428);
            assert.strictEqual(result, false);
        });

        test('returns false when the given mode is only executable for others', function () {
            const result = isExecutableFileMode(421);
            assert.strictEqual(result, false);
        });

        test('returns false when the given mode is only executable for group and others', function () {
            const result = isExecutableFileMode(429);
            assert.strictEqual(result, false);
        });

        test('returns false when the given mode is only executable for user and others', function () {
            const result = isExecutableFileMode(485);
            assert.strictEqual(result, false);
        });

        test('returns false when the given mode is only executable for user and group', function () {
            const result = isExecutableFileMode(492);
            assert.strictEqual(result, false);
        });

        test('returns true when the given mode is executable for all user, group and others', function () {
            const result = isExecutableFileMode(493);
            assert.strictEqual(result, true);
        });

        test('returns true when the given mode is executable for all user, group and others, ignoring other permissions', function () {
            const result = isExecutableFileMode(459);
            assert.strictEqual(result, true);
        });
    });

    test('returns false when converted permissions are missing entries', function () {
        const result = isExecutableFileMode(493, {
            convertObject() {
                return { user: { execute: true } };
            }
        });
        assert.strictEqual(result, false);
    });
});
