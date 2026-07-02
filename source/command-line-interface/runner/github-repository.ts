import { normalizeRepositoryUrl } from '../../bundle-emitter/repository-url-normalizer.ts';

export type GitHubRepositoryParts = {
    readonly owner: string;
    readonly repo: string;
};

const githubRepositoryPattern = /^https:\/\/github\.com\/(?<owner>[^/]+)\/(?<repo>[^/]+)$/u;

export function parseGitHubRepositoryParts(packageInfo: Readonly<Record<string, unknown>>): GitHubRepositoryParts {
    const repositoryUrl = normalizeRepositoryUrl(packageInfo.repository);
    const match = githubRepositoryPattern.exec(String(repositoryUrl));
    if (match?.groups === undefined) {
        throw new Error('package.json repository must point to a GitHub repository');
    }
    return { owner: String(match.groups.owner), repo: String(match.groups.repo) };
}

export function formatGitHubRepositoryName(packageInfo: Readonly<Record<string, unknown>>): string {
    const repository = parseGitHubRepositoryParts(packageInfo);
    return `${repository.owner}/${repository.repo}`;
}
