import { Octokit } from '@octokit/core';
import {
    createGitHubJsonRequestHeaders,
    resolveGitHubResponse,
    resolveOptionalGitHubResponse
} from './github-api-request.ts';

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
    readonly repo: string;
    readonly token: string;
};
type RawGitRef = {
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

function readCreatedTagSha(response: unknown): string {
    const data = readProperty(response, 'data');
    const sha = readStringProperty(data ?? response, 'sha');
    if (sha !== undefined) {
        return sha;
    }
    throw new Error('GitHub tag object response did not include a sha');
}

export function createGitHubReleaseClient(dependencies: GitHubReleaseClientDependencies): GitHubReleaseClient {
    const requestHeaders = createGitHubJsonRequestHeaders(dependencies.token, 'packtory');
    const octokit = new Octokit({
        request: {
            fetch: dependencies.fetch
        }
    });

    async function readTagTarget(ref: RawGitRef): Promise<string> {
        if (ref.object.type === 'commit') {
            return ref.object.sha;
        }
        const response = await resolveGitHubResponse(
            octokit.request('GET /repos/{owner}/{repo}/git/tags/{tag_sha}', {
                headers: requestHeaders,
                owner: dependencies.owner,
                repo: dependencies.repo,
                tag_sha: ref.object.sha
            })
        ) as { readonly data: RawGitTag; };
        return response.data.object.sha;
    }

    async function readTagRef(tagName: string): Promise<RawGitRef | undefined> {
        const response = await resolveOptionalGitHubResponse(
            octokit.request('GET /repos/{owner}/{repo}/git/ref/{ref}', {
                headers: requestHeaders,
                owner: dependencies.owner,
                repo: dependencies.repo,
                ref: `tags/${tagName}`
            }),
            missingGitHubResourceStatusCode
        ) as { readonly data: RawGitRef; } | undefined;
        return response?.data;
    }

    return {
        async createReleaseIfMissing(request) {
            const existing = await resolveOptionalGitHubResponse(
                octokit.request('GET /repos/{owner}/{repo}/releases/tags/{tag}', {
                    headers: requestHeaders,
                    owner: dependencies.owner,
                    repo: dependencies.repo,
                    tag: request.tagName
                }),
                missingGitHubResourceStatusCode
            );
            if (existing !== undefined) {
                return 'existing';
            }
            const created = await resolveOptionalGitHubResponse(
                octokit.request('POST /repos/{owner}/{repo}/releases', {
                    headers: requestHeaders,
                    owner: dependencies.owner,
                    repo: dependencies.repo,
                    tag_name: request.tagName,
                    name: request.name,
                    body: request.body
                }),
                missingGitHubResourceStatusCode
            );
            if (created === undefined) {
                throw new Error(`GitHub release for tag "${request.tagName}" could not be created`);
            }
            return 'created';
        },

        async ensureAnnotatedTag(request) {
            const existing = await readTagRef(request.tagName);
            if (existing !== undefined) {
                assertTagTarget(request.tagName, await readTagTarget(existing), request.targetHead);
                return 'existing';
            }
            const tag = await resolveGitHubResponse(
                octokit.request('POST /repos/{owner}/{repo}/git/tags', {
                    headers: requestHeaders,
                    owner: dependencies.owner,
                    repo: dependencies.repo,
                    tag: request.tagName,
                    message: request.message,
                    object: request.targetHead,
                    type: 'commit'
                })
            );
            await resolveGitHubResponse(
                octokit.request('POST /repos/{owner}/{repo}/git/refs', {
                    headers: requestHeaders,
                    owner: dependencies.owner,
                    repo: dependencies.repo,
                    ref: `refs/tags/${request.tagName}`,
                    sha: readCreatedTagSha(tag)
                })
            );
            return 'created';
        }
    };
}
