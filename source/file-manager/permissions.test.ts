import assert from 'node:assert';
import { test } from 'mocha';
import sinon from 'sinon';
import { convert } from 'unix-permissions';
import { isExecutableFileMode } from './permissions.ts';

test('returns false when the given mode is invalid', () => {
    const result = isExecutableFileMode(-1);
    assert.strictEqual(result, false);
});

test('returns false when the given mode is not executable at all', () => {
    const result = isExecutableFileMode(420);
    assert.strictEqual(result, false);
});

test('returns false when the given mode is only executable for the user', () => {
    const result = isExecutableFileMode(484);
    assert.strictEqual(result, false);
});

test('returns false when the given mode is only executable for the group', () => {
    const result = isExecutableFileMode(428);
    assert.strictEqual(result, false);
});

test('returns false when the given mode is only executable for others', () => {
    const result = isExecutableFileMode(421);
    assert.strictEqual(result, false);
});

test('returns false when the given mode is only executable for group and others', () => {
    const result = isExecutableFileMode(429);
    assert.strictEqual(result, false);
});

test('returns false when the given mode is only executable for user and others', () => {
    const result = isExecutableFileMode(485);
    assert.strictEqual(result, false);
});

test('returns false when the given mode is only executable for user and group', () => {
    const result = isExecutableFileMode(492);
    assert.strictEqual(result, false);
});

test('returns true when the given mode is executable for all user, group and others', () => {
    const result = isExecutableFileMode(493);
    assert.strictEqual(result, true);
});

test('returns true when the given mode is executable for all user, group and others, ignoring other permissions', () => {
    const result = isExecutableFileMode(459);
    assert.strictEqual(result, true);
});

test('returns false when converted permissions are missing entries', () => {
    const convertObjectStub = sinon.stub(convert, 'object');
    convertObjectStub.returns({ user: { execute: true } });

    try {
        const result = isExecutableFileMode(493);
        assert.strictEqual(result, false);
    } finally {
        convertObjectStub.restore();
    }
});
