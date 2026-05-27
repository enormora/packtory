import type _npmFetch from 'npm-registry-fetch';
import { Maybe } from 'true-myth';
import type { RegistrySettings } from '../../config/registry-settings.ts';
import { retryWithFallbackAuth } from './metadata-auth-retry.ts';
import { toRegistryPackagePath } from './registry-package-path.ts';
import { resolveMetadataAuthOptions } from './registry-auth-config.ts';
import {
    parseAbbreviatedPackageResponse,
    parseFullPackageResponse,
    type AbbreviatedPackageResponse,
    type FullPackageResponse
} from './registry-response-schemas.ts';

const notFoundStatusCode = 404;
const forbiddenStatusCode = 403;
const abbreviatedResponseAcceptHeader = 'application/vnd.npm.install-v1+json';

export type PackageVersionDetails = {
    readonly version: string;
    readonly tarballUrl: string;
};

export type PackageReleaseMetadata = {
    readonly publishedAt?: Date | undefined;
    readonly tarballUrl: string;
    readonly version: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return value instanceof Object;
}

function isMissingPackageError(error: unknown): boolean {
    const statusCode = isRecord(error) ? error.statusCode : undefined;
    return statusCode === notFoundStatusCode || statusCode === forbiddenStatusCode;
}

function parseTimestamp(timestamp: string): Date {
    const parsed = new Date(timestamp);

    if (Number.isNaN(parsed.getTime())) {
        throw new TypeError(`Version publish time "${timestamp}" is not a valid timestamp`);
    }

    return parsed;
}

type PackageMetadataRequest<TPackageResponse extends Record<string, unknown>> = {
    readonly headers: Readonly<Record<string, string>> | undefined;
    readonly parsePackageResponse: (response: unknown) => TPackageResponse | undefined;
};

const abbreviatedPackageMetadataRequest: PackageMetadataRequest<AbbreviatedPackageResponse> = {
    parsePackageResponse: parseAbbreviatedPackageResponse,
    headers: { accept: abbreviatedResponseAcceptHeader }
};

const fullPackageMetadataRequest: PackageMetadataRequest<FullPackageResponse> = {
    parsePackageResponse: parseFullPackageResponse,
    headers: undefined
};

async function fetchAndParsePackageMetadata<TPackageResponse extends Record<string, unknown>>(
    npmFetch: typeof _npmFetch,
    packageName: string,
    registrySettings: RegistrySettings,
    request: PackageMetadataRequest<TPackageResponse>
): Promise<Maybe<TPackageResponse>> {
    const auth = resolveMetadataAuthOptions(registrySettings);
    try {
        const response = await retryWithFallbackAuth(registrySettings, auth, async (options) => {
            return npmFetch.json(`/${toRegistryPackagePath(packageName)}`, {
                ...options,
                headers: request.headers
            });
        });

        const result = request.parsePackageResponse(response);
        if (result === undefined) {
            throw new Error('Got an invalid response from registry API');
        }
        return Maybe.just(result);
    } catch (error: unknown) {
        if (isMissingPackageError(error)) {
            return Maybe.nothing<TPackageResponse>();
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
    const packageResponse = await fetchAndParsePackageMetadata(
        npmFetch,
        packageName,
        registrySettings,
        abbreviatedPackageMetadataRequest
    );
    if (packageResponse.isNothing) {
        return Maybe.nothing();
    }
    return extractLatestVersionDetails(packageResponse.value, packageName);
}

export async function fetchLatestPackageReleaseMetadata(
    npmFetch: typeof _npmFetch,
    packageName: string,
    registrySettings: RegistrySettings
): Promise<Maybe<PackageReleaseMetadata>> {
    const packageResponse = await fetchAndParsePackageMetadata(
        npmFetch,
        packageName,
        registrySettings,
        fullPackageMetadataRequest
    );
    if (packageResponse.isNothing) {
        return Maybe.nothing();
    }

    const latestVersion = extractLatestVersionDetails(packageResponse.value, packageName);
    if (latestVersion.isNothing) {
        return Maybe.nothing();
    }

    const publishedAtTimestamp = packageResponse.value.time?.[latestVersion.value.version];

    return Maybe.just({
        version: latestVersion.value.version,
        tarballUrl: latestVersion.value.tarballUrl,
        publishedAt: publishedAtTimestamp === undefined ? undefined : parseTimestamp(publishedAtTimestamp)
    });
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
