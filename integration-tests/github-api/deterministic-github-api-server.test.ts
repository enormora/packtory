import assert from 'node:assert';
import { suite, test } from 'mocha';
import {
    failingGitHubScenario,
    pullRequestScenario,
    repositoryGraphqlScenario
} from './deterministic-github-api-scenarios.ts';
import { withDeterministicGitHubApiServer } from './with-deterministic-github-api-server.ts';

suite('deterministic-github-api-server', function () {
    test(
        'serves configured REST responses and records requests',
        withDeterministicGitHubApiServer(pullRequestScenario, async function (context) {
            const response = await fetch(`${context.baseUrl}/repos/owner/repo/pulls/123`);

            assert.strictEqual(response.status, 200);
            assert.deepStrictEqual(await response.json(), {
                number: 123,
                title: 'Prepare release'
            });
            assert.deepStrictEqual(context.requests(), [
                {
                    body: '',
                    method: 'GET',
                    path: '/repos/owner/repo/pulls/123',
                    search: ''
                }
            ]);
        })
    );

    test(
        'serves configured REST responses with request bodies',
        withDeterministicGitHubApiServer(pullRequestScenario, async function (context) {
            const response = await fetch(`${context.baseUrl}/repos/owner/repo/statuses/head-sha`, {
                method: 'POST',
                body: JSON.stringify({ context: 'Node.js', state: 'pending' })
            });

            assert.strictEqual(response.status, 202);
            assert.deepStrictEqual(await response.json(), { state: 'pending' });
            assert.deepStrictEqual(context.requests(), [
                {
                    body: '{"context":"Node.js","state":"pending"}',
                    method: 'POST',
                    path: '/repos/owner/repo/statuses/head-sha',
                    search: ''
                }
            ]);
        })
    );

    test(
        'serves configured GraphQL responses and records requests',
        withDeterministicGitHubApiServer(repositoryGraphqlScenario, async function (context) {
            const response = await fetch(context.graphqlUrl, {
                method: 'POST',
                body: JSON.stringify({
                    operationName: 'RepositoryId',
                    query: 'query RepositoryId { repository(owner: "owner", name: "repo") { id } }'
                })
            });

            assert.strictEqual(response.status, 200);
            assert.deepStrictEqual(await response.json(), {
                data: {
                    repository: {
                        id: 'R_123'
                    }
                }
            });
            const body =
                '{"operationName":"RepositoryId","query":"query RepositoryId { repository(owner: \\"owner\\", name: \\"repo\\") { id } }"}';

            assert.deepStrictEqual(context.requests(), [
                {
                    body,
                    method: 'POST',
                    path: '/graphql',
                    search: ''
                }
            ]);
        })
    );

    test(
        'serves configured REST errors',
        withDeterministicGitHubApiServer(failingGitHubScenario, async function (context) {
            const response = await fetch(`${context.baseUrl}/repos/owner/repo/pulls/500`);

            assert.strictEqual(response.status, 500);
            assert.deepStrictEqual(await response.json(), { message: 'deterministic failure' });
        })
    );

    test(
        'serves configured GraphQL errors',
        withDeterministicGitHubApiServer(failingGitHubScenario, async function (context) {
            const response = await fetch(context.graphqlUrl, {
                method: 'POST',
                body: JSON.stringify({
                    operationName: 'FailingQuery',
                    query: 'query FailingQuery { viewer { login } }'
                })
            });

            assert.strictEqual(response.status, 500);
            assert.deepStrictEqual(await response.json(), {
                errors: [
                    {
                        message: 'deterministic graphql failure'
                    }
                ]
            });
        })
    );

    test(
        'returns not found for missing routes',
        withDeterministicGitHubApiServer(pullRequestScenario, async function (context) {
            const response = await fetch(`${context.baseUrl}/repos/owner/repo/issues/123`);

            assert.strictEqual(response.status, 404);
            assert.deepStrictEqual(await response.json(), {
                message: 'No deterministic GitHub API route for GET /repos/owner/repo/issues/123'
            });
        })
    );
});
