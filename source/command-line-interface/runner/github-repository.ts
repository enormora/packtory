import { normalizeRepositoryAddress } from '../../bundle-emitter/repository-address-normalizer.ts';

export type GitHubRepositoryParts = {
    readonly owner: string;
    readonly repository: string;
};

const githubRepositoryPattern = /^https:\/\/github\.com\/(?<owner>[^/]+)\/(?<repo>[^/]+)$/u;

export function parseGitHubRepositoryParts(
    packageInformation: Readonly<Record<string, unknown>>
): GitHubRepositoryParts {
    const repositoryAddress = normalizeRepositoryAddress(packageInformation.repository);
    const match = githubRepositoryPattern.exec(String(repositoryAddress));
    if (match?.groups === undefined) {
        throw new Error('package.json repository must point to a GitHub repository');
    }
    return { owner: String(match.groups.owner), repository: String(match.groups.repo) };
}

export function formatGitHubRepositoryName(packageInformation: Readonly<Record<string, unknown>>): string {
    const repository = parseGitHubRepositoryParts(packageInformation);
    return `${repository.owner}/${repository.repository}`;
}
