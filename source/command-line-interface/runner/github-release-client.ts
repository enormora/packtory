import { Octokit } from '@octokit/core';
import { createGitHubJsonRequestHeaders, resolveOptionalGitHubResponse } from './github-api-request.ts';

type GitHubReleaseRequest = {
    readonly body: string;
    readonly name: string;
    readonly tagName: string;
};

export type GitHubReleaseClient = {
    readonly createReleaseIfMissing: (request: GitHubReleaseRequest) => Promise<'created' | 'existing'>;
};

type GitHubReleaseClientDependencies = {
    readonly fetch: typeof globalThis.fetch;
    readonly owner: string;
    readonly repo: string;
    readonly token: string;
};

const notFoundStatusCode = 404;

export function createGitHubReleaseClient(deps: GitHubReleaseClientDependencies): GitHubReleaseClient {
    const requestHeaders = createGitHubJsonRequestHeaders(deps.token, 'packtory');
    const octokit = new Octokit({
        request: {
            fetch: deps.fetch
        }
    });

    return {
        async createReleaseIfMissing(request) {
            const existing = await resolveOptionalGitHubResponse(
                octokit.request('GET /repos/{owner}/{repo}/releases/tags/{tag}', {
                    headers: requestHeaders,
                    owner: deps.owner,
                    repo: deps.repo,
                    tag: request.tagName
                }),
                notFoundStatusCode
            );
            if (existing !== undefined) {
                return 'existing';
            }
            const created = await resolveOptionalGitHubResponse(
                octokit.request('POST /repos/{owner}/{repo}/releases', {
                    headers: requestHeaders,
                    owner: deps.owner,
                    repo: deps.repo,
                    tag_name: request.tagName,
                    name: request.name,
                    body: request.body
                }),
                notFoundStatusCode
            );
            if (created === undefined) {
                throw new Error(`GitHub release for tag "${request.tagName}" could not be created`);
            }
            return 'created';
        }
    };
}
