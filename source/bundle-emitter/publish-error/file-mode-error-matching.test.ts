import assert from 'node:assert';
import { suite, test } from 'mocha';
import { matchFileModeError } from './file-mode-error-matching.ts';

suite('file-mode-error-matching', function () {
    test('matchFileModeError maps ENOENT to a missing-provenance-file message', function () {
        const result = matchFileModeError({ code: 'ENOENT' }, '/p/bundle.json');
        if (result === undefined) {
            assert.fail('Expected matchFileModeError() to return an error');
        }

        assert.strictEqual(result.message.includes('does not exist'), true);
        assert.strictEqual(result.message.includes('"/p/bundle.json"'), true);
    });

    test('matchFileModeError returns undefined for a non-error-like value with no ENOENT code', function () {
        assert.strictEqual(matchFileModeError('plain string', '/p/bundle.json'), undefined);
    });

    test('matchFileModeError returns undefined when the message does not match any provenance error pattern', function () {
        assert.strictEqual(matchFileModeError({ message: 'unrelated' }, '/p/bundle.json'), undefined);
    });

    test('matchFileModeError maps "Bundle is invalid" without "subject"/"digest" to an invalid-bundle message', function () {
        const result = matchFileModeError({ message: 'Bundle is invalid' }, '/p/bundle.json');

        assert.strictEqual(result?.message.includes('not a valid sigstore bundle'), true);
    });

    test('matchFileModeError maps a bundle error containing "digest" to a digest-mismatch message', function () {
        const result = matchFileModeError({ message: 'Bundle is invalid: digest mismatch' }, '/p/bundle.json');

        assert.strictEqual(result?.message.includes('signed against a different tarball'), true);
    });

    test('matchFileModeError maps a bundle error containing "subject" to a digest-mismatch message', function () {
        const result = matchFileModeError({ message: 'subject does not match' }, '/p/bundle.json');

        assert.strictEqual(result?.message.includes('signed against a different tarball'), true);
    });

    test('matchFileModeError attaches the original error as the cause of the rewritten error', function () {
        const original = { message: 'Bundle is invalid' };
        const result = matchFileModeError(original, '/p/bundle.json');

        assert.strictEqual(result?.cause, original);
    });
});
