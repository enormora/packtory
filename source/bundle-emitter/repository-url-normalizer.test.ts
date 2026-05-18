import assert from 'node:assert';
import { test } from 'mocha';
import { normalizeRepositoryUrl } from './repository-url-normalizer.ts';

test('normalizeRepositoryUrl returns undefined for an empty string', () => {
    assert.strictEqual(normalizeRepositoryUrl(''), undefined);
});

test('normalizeRepositoryUrl returns undefined for null and undefined', () => {
    assert.strictEqual(normalizeRepositoryUrl(undefined), undefined);
    assert.strictEqual(normalizeRepositoryUrl(null), undefined);
});

test('normalizeRepositoryUrl returns undefined for a record with no url field', () => {
    assert.strictEqual(normalizeRepositoryUrl({ type: 'git' }), undefined);
});

test('normalizeRepositoryUrl reads the url field from a record input', () => {
    assert.strictEqual(
        normalizeRepositoryUrl({ url: 'https://github.com/owner/repo' }),
        'https://github.com/owner/repo'
    );
});

test('normalizeRepositoryUrl strips a leading git+ prefix from non-hosted URLs', () => {
    assert.strictEqual(normalizeRepositoryUrl('git+ssh://example.com/owner/repo'), 'ssh://example.com/owner/repo');
});

test('normalizeRepositoryUrl strips a trailing .git suffix from non-hosted URLs', () => {
    assert.strictEqual(normalizeRepositoryUrl('https://example.com/owner/repo.git'), 'https://example.com/owner/repo');
});

test('normalizeRepositoryUrl strips a trailing slash from non-hosted URLs', () => {
    assert.strictEqual(normalizeRepositoryUrl('https://example.com/owner/repo/'), 'https://example.com/owner/repo');
});

test('normalizeRepositoryUrl lowercases the resulting URL', () => {
    assert.strictEqual(normalizeRepositoryUrl('HTTPS://Example.COM/OWNER/REPO'), 'https://example.com/owner/repo');
});

test('normalizeRepositoryUrl resolves a hosted git URL to its https form', () => {
    assert.strictEqual(
        normalizeRepositoryUrl('git+https://github.com/Owner/Repo.git'),
        'https://github.com/owner/repo'
    );
});

test('normalizeRepositoryUrl resolves a github shorthand to the canonical https URL', () => {
    assert.strictEqual(normalizeRepositoryUrl('github:owner/repo'), 'https://github.com/owner/repo');
});
