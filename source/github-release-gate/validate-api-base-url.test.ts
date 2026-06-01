import assert from 'node:assert';
import { suite, test } from 'mocha';
import { assertGitHubApiBaseUrl } from './validate-api-base-url.ts';

suite('validate-api-base-url', function () {
    test('accepts the canonical api.github.com URL', function () {
        assert.strictEqual(assertGitHubApiBaseUrl('https://api.github.com'), 'https://api.github.com');
    });

    test('accepts loopback IPv4 over http for testing', function () {
        assert.strictEqual(assertGitHubApiBaseUrl('http://127.0.0.1:1234'), 'http://127.0.0.1:1234');
    });

    test('accepts loopback IPv6 over http for testing', function () {
        assert.strictEqual(assertGitHubApiBaseUrl('http://[::1]:1234'), 'http://[::1]:1234');
    });

    test('accepts localhost over http for testing', function () {
        assert.strictEqual(assertGitHubApiBaseUrl('http://localhost:1234'), 'http://localhost:1234');
    });

    test('rejects an arbitrary public host with the full mismatch message', function () {
        assert.throws(
            () => {
                assertGitHubApiBaseUrl('https://attacker.example/api');
            },
            {
                message:
                    'GITHUB_API_BASE_URL hostname must be "api.github.com", got "attacker.example". ' +
                    'A non-GitHub host would receive the GITHUB_TOKEN.'
            }
        );
    });

    test('rejects a lookalike host', function () {
        assert.throws(() => {
            assertGitHubApiBaseUrl('https://api.github.com.attacker.example');
        }, /hostname must be "api\.github\.com", got "api\.github\.com\.attacker\.example"/u);
    });

    test('rejects an http public host', function () {
        assert.throws(() => {
            assertGitHubApiBaseUrl('http://api.github.com');
        }, /must use https/u);
    });

    test('rejects a malformed URL', function () {
        assert.throws(() => {
            assertGitHubApiBaseUrl('not-a-url');
        }, /is not a valid URL/u);
    });
});
