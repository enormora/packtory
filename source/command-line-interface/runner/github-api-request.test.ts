import assert from 'node:assert';
import { suite, test } from 'mocha';
import { resolveGitHubResponse } from './github-api-request.ts';

function createGitHubError(overrides: Readonly<Record<string, unknown>>): Error {
    return Object.assign(new Error('GitHub request failed'), {
        request: { url: 'https://api.github.com/graphql' },
        status: 403,
        ...overrides
    });
}

async function rejectWith(error: Error): Promise<unknown> {
    async function fail(): Promise<never> {
        throw error;
    }
    return resolveGitHubResponse(fail());
}

async function assertRejectedMessage(error: Error, message: string): Promise<void> {
    await assert.rejects(rejectWith(error), { message });
}

suite('github-api-request', function () {
    test('formats failed GitHub API requests without details when none are available', async function () {
        await assertRejectedMessage(
            createGitHubError({ message: '' }),
            'GitHub API request failed (403) for /graphql'
        );
    });

    test('ignores empty and non-string GitHub API error details', async function () {
        await assertRejectedMessage(
            createGitHubError({
                errors: [ { message: '' }, { message: 123 }, {} ],
                message: '',
                response: {
                    data: { errors: [ { message: undefined } ], message: 456 },
                    errors: [ { message: null } ]
                }
            }),
            'GitHub API request failed (403) for /graphql'
        );
    });

    test('appends unique GitHub API error details from GraphQL error shapes', async function () {
        await assertRejectedMessage(
            createGitHubError({
                errors: [ { message: 'ruleset rejected the update' }, {} ],
                message: 'Resource not accessible by integration',
                response: {
                    data: {
                        errors: [ { message: 'branch requires signed commits' } ],
                        message: 'GraphQL request failed'
                    },
                    errors: [ { message: 'secondary GraphQL error' } ]
                }
            }),
            [
                'GitHub API request failed (403) for /graphql: Resource not accessible by integration',
                'GraphQL request failed',
                'ruleset rejected the update',
                'secondary GraphQL error',
                'branch requires signed commits'
            ]
                .join('; ')
        );
    });
});
