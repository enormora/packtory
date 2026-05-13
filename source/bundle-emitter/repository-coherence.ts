import { normalizeRepositoryUrl } from './repository-url-normalizer.ts';

export type CiEnvironment = {
    readonly githubServerUrl: string | undefined;
    readonly githubRepository: string | undefined;
    readonly gitlabProjectUrl: string | undefined;
};

function isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.length > 0;
}

export function readCiEnvironment(env: Readonly<Record<string, string | undefined>>): CiEnvironment {
    return {
        githubServerUrl: env.GITHUB_SERVER_URL,
        githubRepository: env.GITHUB_REPOSITORY,
        gitlabProjectUrl: env.CI_PROJECT_URL
    };
}

export function getCiRepositoryUrl(env: CiEnvironment): string | undefined {
    if (isNonEmptyString(env.githubServerUrl) && isNonEmptyString(env.githubRepository)) {
        return `${env.githubServerUrl}/${env.githubRepository}`;
    }

    if (isNonEmptyString(env.gitlabProjectUrl)) {
        return env.gitlabProjectUrl;
    }

    return undefined;
}

const noRepositoryDeclaredMessage = [
    'Provenance is enabled but the package has no repository declared.',
    'Add a "repository" entry to additionalPackageJsonAttributes',
    "so consumers can verify the attestation's source claim."
].join('\n');

const noCiDetectedMessage = [
    'Provenance auto mode is enabled but no CI repository was detected.',
    'Provenance auto mode requires GitHub Actions or GitLab CI; expected',
    'one of GITHUB_SERVER_URL+GITHUB_REPOSITORY or CI_PROJECT_URL.'
].join('\n');

function buildMismatchMessage(configuredUrl: string, ciUrl: string): string {
    return [
        "Provenance is enabled but the package's repository URL does not match",
        'the CI repository.',
        `Configured repository: ${configuredUrl}`,
        `CI repository:         ${ciUrl}`,
        'Either correct the package.json repository field, or disable provenance',
        'if the mismatch is intentional.'
    ].join('\n');
}

export function assertRepositoryCoherence(
    manifest: { readonly repository?: unknown },
    ciRepositoryUrl: string | undefined
): void {
    const normalizedManifestUrl = normalizeRepositoryUrl(manifest.repository);
    if (normalizedManifestUrl === undefined) {
        throw new Error(noRepositoryDeclaredMessage);
    }

    const normalizedCiUrl = normalizeRepositoryUrl(ciRepositoryUrl);
    if (normalizedCiUrl === undefined) {
        throw new Error(noCiDetectedMessage);
    }

    if (normalizedCiUrl !== normalizedManifestUrl) {
        throw new Error(buildMismatchMessage(normalizedManifestUrl, normalizedCiUrl));
    }
}
