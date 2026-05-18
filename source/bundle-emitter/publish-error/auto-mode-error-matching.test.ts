import assert from 'node:assert';
import { suite, test } from 'mocha';
import { matchAutoModeError } from './auto-mode-error-matching.ts';

suite('auto-mode-error-matching', function () {
    test('matchAutoModeError returns undefined when given a non-error-like value', function () {
        assert.strictEqual(matchAutoModeError(undefined), undefined);
        assert.strictEqual(matchAutoModeError('not an error'), undefined);
    });

    test('matchAutoModeError returns undefined when the message has no recognized marker', function () {
        assert.strictEqual(matchAutoModeError({ message: 'unrelated failure' }), undefined);
    });

    test('matchAutoModeError maps the unsupported-provider marker and embeds the CI name', function () {
        const result = matchAutoModeError({
            message: 'provenance is not supported for provider: CircleCI please use file mode'
        });

        assert.ok(result instanceof Error);
        assert.ok(result.message.includes('Detected CI: CircleCI.'));
    });

    test('matchAutoModeError falls back to "unknown" when no CI name follows the unsupported-provider marker', function () {
        const result = matchAutoModeError({ message: 'not supported for provider:' });

        assert.ok(result?.message.includes('Detected CI: unknown.'));
    });

    test('matchAutoModeError preserves the CI name when it is the last token without trailing whitespace', function () {
        const result = matchAutoModeError({ message: 'not supported for provider: CircleCI' });

        assert.ok(result?.message.includes('Detected CI: CircleCI.'));
    });

    test('matchAutoModeError maps the GitHub Actions id-token error to a workflow-permissions hint', function () {
        const result = matchAutoModeError({
            message: 'token does not have "write" access to the "id-token" permission'
        });

        assert.ok(result?.message.includes('permissions: id-token: write'));
    });

    test('matchAutoModeError maps the GitLab sigstore id-token error to a sigstore-audience hint', function () {
        const result = matchAutoModeError({ message: 'SIGSTORE_ID_TOKEN environment variable is missing' });

        assert.ok(result?.message.includes('sigstore'));
    });

    test('matchAutoModeError attaches the original error as the cause of the rewritten error', function () {
        const original = { message: 'token does not have "write" access to the "id-token" permission' };
        const result = matchAutoModeError(original);

        assert.strictEqual(result?.cause, original);
    });
});
