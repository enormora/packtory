import assert from 'node:assert';
import { suite, test } from 'mocha';
import { normalizeRepositoryAddress } from './repository-address-normalizer.ts';

suite('repository-url-normalizer', function () {
    suite('empty inputs', function () {
        test('normalizeRepositoryAddress returns undefined for an empty string', function () {
            assert.strictEqual(normalizeRepositoryAddress(''), undefined);
        });

        test('normalizeRepositoryAddress returns undefined for null and undefined', function () {
            assert.strictEqual(normalizeRepositoryAddress(undefined), undefined);
            assert.strictEqual(normalizeRepositoryAddress(null), undefined);
        });

        test('normalizeRepositoryAddress returns undefined for a record with no url field', function () {
            assert.strictEqual(normalizeRepositoryAddress({ type: 'git' }), undefined);
        });
    });

    suite('plain urls', function () {
        test('normalizeRepositoryAddress reads the url field from a record input', function () {
            assert.strictEqual(
                normalizeRepositoryAddress({ url: 'https://github.com/owner/repo' }),
                'https://github.com/owner/repo'
            );
        });

        test('normalizeRepositoryAddress strips a leading git+ prefix from non-hosted URLs', function () {
            assert.strictEqual(
                normalizeRepositoryAddress('git+ssh://example.com/owner/repo'),
                'ssh://example.com/owner/repo'
            );
        });

        test('normalizeRepositoryAddress does not strip git+ when it appears outside the prefix', function () {
            assert.strictEqual(
                normalizeRepositoryAddress('https://example.com/owner/git+repo'),
                'https://example.com/owner/git+repo'
            );
        });

        test('normalizeRepositoryAddress strips a trailing .git suffix from non-hosted URLs', function () {
            assert.strictEqual(
                normalizeRepositoryAddress('https://example.com/owner/repo.git'),
                'https://example.com/owner/repo'
            );
        });

        test('normalizeRepositoryAddress does not strip .git when it is not a trailing suffix', function () {
            assert.strictEqual(
                normalizeRepositoryAddress('https://example.com/owner/repo.git/info'),
                'https://example.com/owner/repo.git/info'
            );
        });

        test('normalizeRepositoryAddress strips a trailing slash from non-hosted URLs', function () {
            assert.strictEqual(
                normalizeRepositoryAddress('https://example.com/owner/repo/'),
                'https://example.com/owner/repo'
            );
        });

        test('normalizeRepositoryAddress lowercases the resulting URL', function () {
            assert.strictEqual(
                normalizeRepositoryAddress('HTTPS://Example.COM/OWNER/REPO'),
                'https://example.com/owner/repo'
            );
        });
    });

    suite('hosted urls', function () {
        test('normalizeRepositoryAddress resolves a hosted git URL to its https form', function () {
            assert.strictEqual(
                normalizeRepositoryAddress('git+https://github.com/Owner/Repo.git'),
                'https://github.com/owner/repo'
            );
        });

        test('normalizeRepositoryAddress resolves a github shorthand to the canonical https URL', function () {
            assert.strictEqual(normalizeRepositoryAddress('github:owner/repo'), 'https://github.com/owner/repo');
        });
    });
});
