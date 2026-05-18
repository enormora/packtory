import assert from 'node:assert';
import { test } from 'mocha';
import { matchFileModeError } from './file-mode-error-matching.ts';

test('matchFileModeError maps ENOENT to a missing-provenance-file message', () => {
    const result = matchFileModeError({ code: 'ENOENT' }, '/p/bundle.json');

    assert.ok(result?.message.includes('does not exist'));
    assert.ok(result?.message.includes('"/p/bundle.json"'));
});

test('matchFileModeError returns undefined for a non-error-like value with no ENOENT code', () => {
    assert.strictEqual(matchFileModeError('plain string', '/p/bundle.json'), undefined);
});

test('matchFileModeError returns undefined when the message does not match any provenance error pattern', () => {
    assert.strictEqual(matchFileModeError({ message: 'unrelated' }, '/p/bundle.json'), undefined);
});

test('matchFileModeError maps "Bundle is invalid" without "subject"/"digest" to an invalid-bundle message', () => {
    const result = matchFileModeError({ message: 'Bundle is invalid' }, '/p/bundle.json');

    assert.ok(result?.message.includes('not a valid sigstore bundle'));
});

test('matchFileModeError maps a bundle error containing "digest" to a digest-mismatch message', () => {
    const result = matchFileModeError({ message: 'Bundle is invalid: digest mismatch' }, '/p/bundle.json');

    assert.ok(result?.message.includes('signed against a different tarball'));
});

test('matchFileModeError maps a bundle error containing "subject" to a digest-mismatch message', () => {
    const result = matchFileModeError({ message: 'subject does not match' }, '/p/bundle.json');

    assert.ok(result?.message.includes('signed against a different tarball'));
});

test('matchFileModeError attaches the original error as the cause of the rewritten error', () => {
    const original = { message: 'Bundle is invalid' };
    const result = matchFileModeError(original, '/p/bundle.json');

    assert.strictEqual(result?.cause, original);
});
