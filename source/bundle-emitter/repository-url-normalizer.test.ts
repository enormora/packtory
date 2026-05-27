import assert from 'node:assert';
import { suite, test } from 'mocha';
import { normalizeRepositoryUrl } from './repository-url-normalizer.ts';

suite('repository-url-normalizer', function () {
    test('normalizeRepositoryUrl returns undefined for an empty string', function () {
        assert.strictEqual(normalizeRepositoryUrl(''), undefined);
    });

    test('normalizeRepositoryUrl returns undefined for null and undefined', function () {
        assert.strictEqual(normalizeRepositoryUrl(undefined), undefined);
        assert.strictEqual(normalizeRepositoryUrl(null), undefined);
    });

    test('normalizeRepositoryUrl returns undefined for a record with no url field', function () {
        assert.strictEqual(normalizeRepositoryUrl({ type: 'git' }), undefined);
    });

    test('normalizeRepositoryUrl reads the url field from a record input', function () {
        assert.strictEqual(
            normalizeRepositoryUrl({ url: 'https://github.com/owner/repo' }),
            'https://github.com/owner/repo'
        );
    });

    test('normalizeRepositoryUrl strips a leading git+ prefix from non-hosted URLs', function () {
        assert.strictEqual(normalizeRepositoryUrl('git+ssh://example.com/owner/repo'), 'ssh://example.com/owner/repo');
    });

    test('normalizeRepositoryUrl does not strip git+ when it appears outside the prefix', function () {
        assert.strictEqual(
            normalizeRepositoryUrl('https://example.com/owner/git+repo'),
            'https://example.com/owner/git+repo'
        );
    });

    test('normalizeRepositoryUrl strips a trailing .git suffix from non-hosted URLs', function () {
        assert.strictEqual(
            normalizeRepositoryUrl('https://example.com/owner/repo.git'),
            'https://example.com/owner/repo'
        );
    });

    test('normalizeRepositoryUrl does not strip .git when it is not a trailing suffix', function () {
        assert.strictEqual(
            normalizeRepositoryUrl('https://example.com/owner/repo.git/info'),
            'https://example.com/owner/repo.git/info'
        );
    });

    test('normalizeRepositoryUrl strips a trailing slash from non-hosted URLs', function () {
        assert.strictEqual(normalizeRepositoryUrl('https://example.com/owner/repo/'), 'https://example.com/owner/repo');
    });

    test('normalizeRepositoryUrl lowercases the resulting URL', function () {
        assert.strictEqual(normalizeRepositoryUrl('HTTPS://Example.COM/OWNER/REPO'), 'https://example.com/owner/repo');
    });

    test('normalizeRepositoryUrl resolves a hosted git URL to its https form', function () {
        assert.strictEqual(
            normalizeRepositoryUrl('git+https://github.com/Owner/Repo.git'),
            'https://github.com/owner/repo'
        );
    });

    test('normalizeRepositoryUrl resolves a github shorthand to the canonical https URL', function () {
        assert.strictEqual(normalizeRepositoryUrl('github:owner/repo'), 'https://github.com/owner/repo');
    });
});
