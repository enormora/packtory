import assert from 'node:assert';
import { suite, test } from 'mocha';
import { bundleRelativePathSchema, nonEmptyStringSchema } from './base-validations.ts';

function expectAccepts(value: unknown): () => void {
    return () => {
        assert.strictEqual(bundleRelativePathSchema.safeParse(value).success, true);
    };
}

function expectRejects(value: unknown): () => void {
    return () => {
        assert.strictEqual(bundleRelativePathSchema.safeParse(value).success, false);
    };
}

suite('base-validations', function () {
    test('nonEmptyStringSchema accepts a non-empty string', function () {
        assert.strictEqual(nonEmptyStringSchema.safeParse('hello').success, true);
    });

    test('nonEmptyStringSchema rejects an empty string', function () {
        assert.strictEqual(nonEmptyStringSchema.safeParse('').success, false);
    });

    test('nonEmptyStringSchema rejects non-string inputs', function () {
        assert.strictEqual(nonEmptyStringSchema.safeParse(null).success, false);
        assert.strictEqual(nonEmptyStringSchema.safeParse(42).success, false);
    });

    suite('bundleRelativePathSchema accepts safe paths', function () {
        for (const value of ['good/path.txt', 'nested/folder/file.txt', 'just-a-file.txt', 'foo.bar.baz']) {
            test(`accepts "${value}"`, expectAccepts(value));
        }
    });

    suite('bundleRelativePathSchema rejects unsafe paths', function () {
        for (const value of [
            '',
            '..',
            '../escape.txt',
            'foo/../bar.txt',
            'foo/..',
            '/etc/passwd',
            'C:/Windows/System32',
            'C:\\Windows\\System32',
            '..\\escape.txt',
            'foo\\..\\bar.txt'
        ]) {
            test(`rejects "${value}"`, expectRejects(value));
        }
    });

    test('bundleRelativePathSchema rejects null', expectRejects(null));

    test('bundleRelativePathSchema rejects numbers', expectRejects(42));
});
