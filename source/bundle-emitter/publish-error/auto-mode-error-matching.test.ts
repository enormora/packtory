import assert from 'node:assert';
import { suite, test } from 'mocha';
import { matchAutomaticModeError } from './auto-mode-error-matching.ts';

suite('auto-mode-error-matching', function () {
    test('matchAutomaticModeError returns undefined when given a non-error-like value', function () {
        assert.strictEqual(matchAutomaticModeError(undefined), undefined);
        assert.strictEqual(matchAutomaticModeError('not an error'), undefined);
    });

    test('matchAutomaticModeError returns undefined when the message has no recognized marker', function () {
        assert.strictEqual(matchAutomaticModeError({ message: 'unrelated failure' }), undefined);
    });

    test('matchAutomaticModeError maps the unsupported-provider marker and embeds the CI name', function () {
        const result = matchAutomaticModeError({
            message: 'provenance is not supported for provider: CircleCI please use file mode'
        });

        assert.ok(result instanceof Error);
        assert.ok(result.message.includes('Detected CI: CircleCI.'));
    });

    test('matchAutomaticModeError falls back to "unknown" when no CI name follows the unsupported-provider marker', function () {
        const result = matchAutomaticModeError({ message: 'not supported for provider:' });

        assert.strictEqual(result?.message.includes('Detected CI: unknown.'), true);
    });

    test('matchAutomaticModeError falls back to "unknown" when the marker is only followed by whitespace', function () {
        const result = matchAutomaticModeError({ message: 'not supported for provider:   ' });

        assert.strictEqual(result?.message.includes('Detected CI: unknown.'), true);
    });

    test('matchAutomaticModeError preserves the CI name when it is the last token without trailing whitespace', function () {
        const result = matchAutomaticModeError({ message: 'not supported for provider: CircleCI' });

        assert.strictEqual(result?.message.includes('Detected CI: CircleCI.'), true);
    });

    test('matchAutomaticModeError only captures the first provider token after the marker', function () {
        const result = matchAutomaticModeError({ message: 'not supported for provider: CircleCI runner pool' });

        assert.strictEqual(result?.message.includes('Detected CI: CircleCI.'), true);
    });

    test('matchAutomaticModeError maps the GitHub Actions id-token error to a workflow-permissions hint', function () {
        const result = matchAutomaticModeError({
            message: 'token does not have "write" access to the "id-token" permission'
        });

        assert.strictEqual(result?.message.includes('permissions: id-token: write'), true);
    });

    test('matchAutomaticModeError maps the GitLab sigstore id-token error to a sigstore-audience hint', function () {
        const result = matchAutomaticModeError({ message: 'SIGSTORE_ID_TOKEN environment variable is missing' });

        assert.strictEqual(result?.message.includes('sigstore'), true);
    });

    test('matchAutomaticModeError attaches the original error as the cause of the rewritten error', function () {
        const original = { message: 'token does not have "write" access to the "id-token" permission' };
        const result = matchAutomaticModeError(original);

        assert.strictEqual(result?.cause, original);
    });
});
