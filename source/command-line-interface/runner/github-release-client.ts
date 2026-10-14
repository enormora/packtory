import { Octokit } from '@octokit/core';
import { toGitHubRequest } from '../../common/github-request.ts';
import {
    createGitHubJavaScriptObjectNotationRequestHeaders,
    resolveGitHubResponse,
    resolveOptionalGitHubResponse
} from './github-application-programming-interface-request.ts';

type GitHubReleaseRequest = {
    readonly body: string;
    readonly name: string;
    readonly tagName: string;
};
type GitHubTagRequest = {
    readonly message: string;
    readonly tagName: string;
    readonly targetHead: string;
};

export type GitHubReleaseClient = {
    readonly createReleaseIfMissing: (request: GitHubReleaseRequest) => Promise<'created' | 'existing'>;
    readonly ensureAnnotatedTag: (request: GitHubTagRequest) => Promise<'created' | 'existing'>;
};

type GitHubReleaseClientDependencies = {
    readonly fetch: typeof globalThis.fetch;
    readonly owner: string;
    readonly repository: string;
    readonly token: string;
};
type RawGitReference = {
    readonly object: {
        readonly sha: string;
        readonly type: string;
    };
};
type RawGitTag = {
    readonly object: {
        readonly sha: string;
        readonly type: string;
    };
};

const missingGitHubResourceStatusCode = 404;

function assertTagTarget(tagName: string, actual: string, expected: string): void {
    if (actual === expected) {
        return;
    }
    throw new Error(`Tag "${tagName}" already exists at ${actual}, expected ${expected}`);
}

function readProperty(value: unknown, property: string): unknown {
    return Reflect.get(new Object(value), property);
}

function readStringProperty(value: unknown, property: string): string | undefined {
    const propertyValue = readProperty(value, property);
    return typeof propertyValue === 'string' && propertyValue.length > 0 ? propertyValue : undefined;
}

function readCreatedTagHash(response: unknown): string {
    const data = readProperty(response, 'data');
    const hash = readStringProperty(data ?? response, 'sha');
    if (hash !== undefined) {
        return hash;
    }
    throw new Error('GitHub tag object response did not include a sha');
}

export function createGitHubReleaseClient(dependencies: GitHubReleaseClientDependencies): GitHubReleaseClient {
    const requestHeaders = createGitHubJavaScriptObjectNotationRequestHeaders(dependencies.token, 'packtory');
    const octokit = new Octokit({
        request: {
            fetch: dependencies.fetch
        }
    });

    async function readTagTarget(reference: RawGitReference): Promise<string> {
        if (reference.object.type === 'commit') {
            return reference.object.sha;
        }
        const response = await resolveGitHubResponse(
            octokit.request(
                'GET /repos/{owner}/{repo}/git/tags/{tag_sha}',
                toGitHubRequest({
                    headers: requestHeaders,
                    owner: dependencies.owner,
                    repository: dependencies.repository,
                    tag_sha: reference.object.sha
                })
            )
        ) as { readonly data: RawGitTag; };
        return response.data.object.sha;
    }

    async function readTagReference(tagName: string): Promise<RawGitReference | undefined> {
        const response = await resolveOptionalGitHubResponse(
            octokit.request(
                'GET /repos/{owner}/{repo}/git/ref/{ref}',
                toGitHubRequest({
                    headers: requestHeaders,
                    owner: dependencies.owner,
                    repository: dependencies.repository,
                    reference: `tags/${tagName}`
                })
            ),
            missingGitHubResourceStatusCode
        ) as { readonly data: RawGitReference; } | undefined;
        return response?.data;
    }

    return {
        async createReleaseIfMissing(request) {
            const existing = await resolveOptionalGitHubResponse(
                octokit.request(
                    'GET /repos/{owner}/{repo}/releases/tags/{tag}',
                    toGitHubRequest({
                        headers: requestHeaders,
                        owner: dependencies.owner,
                        repository: dependencies.repository,
                        tag: request.tagName
                    })
                ),
                missingGitHubResourceStatusCode
            );
            if (existing !== undefined) {
                return 'existing';
            }
            const created = await resolveOptionalGitHubResponse(
                octokit.request(
                    'POST /repos/{owner}/{repo}/releases',
                    toGitHubRequest({
                        headers: requestHeaders,
                        owner: dependencies.owner,
                        repository: dependencies.repository,
                        tag_name: request.tagName,
                        name: request.name,
                        body: request.body
                    })
                ),
                missingGitHubResourceStatusCode
            );
            if (created === undefined) {
                throw new Error(`GitHub release for tag "${request.tagName}" could not be created`);
            }
            return 'created';
        },

        async ensureAnnotatedTag(request) {
            const existing = await readTagReference(request.tagName);
            if (existing !== undefined) {
                assertTagTarget(request.tagName, await readTagTarget(existing), request.targetHead);
                return 'existing';
            }
            const tag = await resolveGitHubResponse(
                octokit.request(
                    'POST /repos/{owner}/{repo}/git/tags',
                    toGitHubRequest({
                        headers: requestHeaders,
                        owner: dependencies.owner,
                        repository: dependencies.repository,
                        tag: request.tagName,
                        message: request.message,
                        object: request.targetHead,
                        type: 'commit'
                    })
                )
            );
            await resolveGitHubResponse(
                octokit.request(
                    'POST /repos/{owner}/{repo}/git/refs',
                    toGitHubRequest({
                        headers: requestHeaders,
                        owner: dependencies.owner,
                        repository: dependencies.repository,
                        reference: `refs/tags/${request.tagName}`,
                        hash: readCreatedTagHash(tag)
                    })
                )
            );
            return 'created';
        }
    };
}
