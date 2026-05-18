import type _npmFetch from 'npm-registry-fetch';
import { Maybe } from 'true-myth';
import type { RegistrySettings } from '../../config/registry-settings.ts';
import { retryWithFallbackAuth } from './metadata-auth-retry.ts';
import { resolveMetadataAuthOptions } from './registry-auth-config.ts';
import { parseAbbreviatedPackageResponse, type AbbreviatedPackageResponse } from './registry-response-schemas.ts';

const notFoundStatusCode = 404;
const forbiddenStatusCode = 403;
const abbreviatedResponseAcceptHeader = 'application/vnd.npm.install-v1+json';

export type PackageVersionDetails = {
    readonly version: string;
    readonly tarballUrl: string;
};

function encodePackageName(name: string): string {
    return name.replace('/', '%2F');
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return value instanceof Object;
}

function isMissingPackageError(error: unknown): boolean {
    const statusCode = isRecord(error) ? error.statusCode : undefined;
    return statusCode === notFoundStatusCode || statusCode === forbiddenStatusCode;
}

async function fetchPackageMetadata(
    npmFetch: typeof _npmFetch,
    packageName: string,
    registrySettings: RegistrySettings
): Promise<Maybe<AbbreviatedPackageResponse>> {
    const auth = resolveMetadataAuthOptions(registrySettings);
    try {
        const response = await retryWithFallbackAuth(registrySettings, auth, async (options) => {
            return npmFetch.json(`/${encodePackageName(packageName)}`, {
                ...options,
                headers: { accept: abbreviatedResponseAcceptHeader }
            });
        });

        const result = parseAbbreviatedPackageResponse(response);
        if (result === undefined) {
            throw new Error('Got an invalid response from registry API');
        }
        return Maybe.just(result);
    } catch (error: unknown) {
        if (isMissingPackageError(error)) {
            return Maybe.nothing();
        }
        throw error;
    }
}

function extractLatestVersionDetails(
    packageResponse: AbbreviatedPackageResponse,
    packageName: string
): Maybe<PackageVersionDetails> {
    const latestVersion = packageResponse['dist-tags'].latest;
    if (latestVersion === undefined) {
        return Maybe.nothing();
    }

    const versionData = packageResponse.versions[latestVersion];
    if (versionData === undefined) {
        throw new Error(
            `Version "${latestVersion}" for package "${packageName}" has no entry in the registry response`
        );
    }

    return Maybe.just({ version: latestVersion, tarballUrl: versionData.dist.tarball });
}

export async function fetchLatestPackageVersion(
    npmFetch: typeof _npmFetch,
    packageName: string,
    registrySettings: RegistrySettings
): Promise<Maybe<PackageVersionDetails>> {
    const packageResponse = await fetchPackageMetadata(npmFetch, packageName, registrySettings);
    if (packageResponse.isNothing) {
        return Maybe.nothing();
    }
    return extractLatestVersionDetails(packageResponse.value, packageName);
}

export async function fetchPackageTarball(
    npmFetch: typeof _npmFetch,
    tarballUrl: string,
    registrySettings: RegistrySettings
): Promise<Buffer> {
    const auth = resolveMetadataAuthOptions(registrySettings);
    const response = await retryWithFallbackAuth(registrySettings, auth, async (options) => {
        return npmFetch(tarballUrl, options);
    });
    return response.buffer();
}
