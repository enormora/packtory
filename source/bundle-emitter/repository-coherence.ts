import { normalizeRepositoryUrl } from './repository-url-normalizer.ts';

export type CiEnvironment = {
    readonly githubServerUrl: string | undefined;
    readonly githubRepository: string | undefined;
    readonly gitlabProjectUrl: string | undefined;
};

export function readCiEnvironment(env: Readonly<Record<string, string | undefined>>): CiEnvironment {
    return {
        githubServerUrl: env.GITHUB_SERVER_URL,
        githubRepository: env.GITHUB_REPOSITORY,
        gitlabProjectUrl: env.CI_PROJECT_URL
    };
}

function isDefinedValue(value: string | undefined): value is string {
    return value !== undefined && value !== '';
}

export function getCiRepositoryUrl(env: CiEnvironment): string | undefined {
    if (isDefinedValue(env.githubServerUrl) && isDefinedValue(env.githubRepository)) {
        return `${env.githubServerUrl}/${env.githubRepository}`;
    }

    if (isDefinedValue(env.gitlabProjectUrl)) {
        return env.gitlabProjectUrl;
    }

    return undefined;
}

const noRepositoryDeclaredMessage = 'Provenance is enabled but the package has no repository declared.\n' +
    'Add a "repository" entry to additionalPackageJsonAttributes\n' +
    "so consumers can verify the attestation's source claim.";

const noCiDetectedMessage = 'Provenance auto mode is enabled but no CI repository was detected.\n' +
    'Provenance auto mode requires GitHub Actions or GitLab CI; expected\n' +
    'one of GITHUB_SERVER_URL+GITHUB_REPOSITORY or CI_PROJECT_URL.';

type RepositoryManifest = {
    readonly repository?: unknown;
};

function buildMismatchMessage(configuredUrl: string, ciUrl: string): string {
    return (
        "Provenance is enabled but the package's repository URL does not match\n" +
        'the CI repository.\n' +
        `Configured repository: ${configuredUrl}\n` +
        `CI repository:         ${ciUrl}\n` +
        'Either correct the package.json repository field, or disable provenance\n' +
        'if the mismatch is intentional.'
    );
}

export function assertRepositoryCoherence(
    manifest: RepositoryManifest,
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
