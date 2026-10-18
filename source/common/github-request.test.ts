import assert from 'node:assert';
import { suite, test } from 'mocha';
import { toGitHubRequest } from './github-request.ts';

suite('GitHub request adapter', function () {
    test('copies array values so library mutations leave the owned input intact', function () {
        const input = { labels: [ 'release' ], constructor: 'request constructor' };
        const request = toGitHubRequest(input);
        request.labels.push('published');
        assert.deepStrictEqual(input.labels, [ 'release' ]);
        assert.deepStrictEqual(request, { labels: [ 'release', 'published' ], constructor: 'request constructor' });
    });

    test('translates owned names while preserving request values and the original input', function () {
        const input = {
            repository: 'package-repository',
            reference: 'heads/main',
            hash: 'commit-hash',
            baseAddress: 'https://example.test',
            expectedHeadObjectIdentifier: 'expected-head',
            owner: 'package-owner'
        };
        assert.deepStrictEqual(toGitHubRequest(input), {
            repo: 'package-repository',
            ref: 'heads/main',
            sha: 'commit-hash',
            baseUrl: 'https://example.test',
            expectedHeadOid: 'expected-head',
            owner: 'package-owner'
        });
        assert.strictEqual(input.repository, 'package-repository');
        assert.strictEqual(Object.hasOwn(input, 'repo'), false);
    });
});
