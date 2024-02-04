import test from 'ava';
import { isExecutableFileMode } from './permissions.js';

test('returns false when the given mode is invalid', (t) => {
    const result = isExecutableFileMode(-1);
    t.is(result, false);
});

test('returns false when the given mode is not executable at all', (t) => {
    const result = isExecutableFileMode(420);
    t.is(result, false);
});

test('returns false when the given mode is only executable for the user', (t) => {
    const result = isExecutableFileMode(484);
    t.is(result, false);
});

test('returns false when the given mode is only executable for the group', (t) => {
    const result = isExecutableFileMode(428);
    t.is(result, false);
});

test('returns false when the given mode is only executable for others', (t) => {
    const result = isExecutableFileMode(421);
    t.is(result, false);
});

test('returns false when the given mode is only executable for group and others', (t) => {
    const result = isExecutableFileMode(429);
    t.is(result, false);
});

test('returns false when the given mode is only executable for user and others', (t) => {
    const result = isExecutableFileMode(485);
    t.is(result, false);
});

test('returns false when the given mode is only executable for user and group', (t) => {
    const result = isExecutableFileMode(492);
    t.is(result, false);
});

test('returns true when the given mode is executable for all user, group and others', (t) => {
    const result = isExecutableFileMode(493);
    t.is(result, true);
});

test('returns true when the given mode is executable for all user, group and others, ignoring other permissions', (t) => {
    const result = isExecutableFileMode(459);
    t.is(result, true);
});
