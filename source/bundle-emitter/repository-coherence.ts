import { normalizeRepositoryAddress } from './repository-address-normalizer.ts';

export type ContinuousIntegrationEnvironment = {
    readonly githubServerAddress: string | undefined;
    readonly githubRepository: string | undefined;
    readonly gitlabProjectAddress: string | undefined;
};

export function readContinuousIntegrationEnvironment(
    environment: Readonly<Record<string, string | undefined>>
): ContinuousIntegrationEnvironment {
    return {
        githubServerAddress: environment.GITHUB_SERVER_URL,
        githubRepository: environment.GITHUB_REPOSITORY,
        gitlabProjectAddress: environment.CI_PROJECT_URL
    };
}

function isDefinedValue(value: string | undefined): value is string {
    return value !== undefined && value !== '';
}

export function getContinuousIntegrationRepositoryAddress(
    environment: ContinuousIntegrationEnvironment
): string | undefined {
    if (isDefinedValue(environment.githubServerAddress) && isDefinedValue(environment.githubRepository)) {
        return `${environment.githubServerAddress}/${environment.githubRepository}`;
    }

    if (isDefinedValue(environment.gitlabProjectAddress)) {
        return environment.gitlabProjectAddress;
    }

    return undefined;
}

const noRepositoryDeclaredMessage = 'Provenance is enabled but the package has no repository declared.\n' +
    'Add a "repository" entry to additionalPackageManifestAttributes\n' +
    "so consumers can verify the attestation's source claim.";

const noContinuousIntegrationDetectedMessage = 'Provenance auto mode is enabled but no CI repository was detected.\n' +
    'Provenance auto mode requires GitHub Actions or GitLab CI; expected\n' +
    'one of GITHUB_SERVER_URL+GITHUB_REPOSITORY or CI_PROJECT_URL.';

type RepositoryManifest = {
    readonly repository?: unknown;
};

function buildMismatchMessage(configuredAddress: string, continuousIntegrationAddress: string): string {
    return (
        "Provenance is enabled but the package's repository URL does not match\n" +
        'the CI repository.\n' +
        `Configured repository: ${configuredAddress}\n` +
        `CI repository:         ${continuousIntegrationAddress}\n` +
        'Either correct the package.json repository field, or disable provenance\n' +
        'if the mismatch is intentional.'
    );
}

export function assertRepositoryCoherence(
    manifest: RepositoryManifest,
    continuousIntegrationRepositoryAddress: string | undefined
): void {
    const normalizedManifestAddress = normalizeRepositoryAddress(manifest.repository);
    if (normalizedManifestAddress === undefined) {
        throw new Error(noRepositoryDeclaredMessage);
    }

    const normalizedContinuousIntegrationAddress = normalizeRepositoryAddress(continuousIntegrationRepositoryAddress);
    if (normalizedContinuousIntegrationAddress === undefined) {
        throw new Error(noContinuousIntegrationDetectedMessage);
    }

    if (normalizedContinuousIntegrationAddress !== normalizedManifestAddress) {
        throw new Error(buildMismatchMessage(normalizedManifestAddress, normalizedContinuousIntegrationAddress));
    }
}
