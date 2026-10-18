import { Maybe } from 'true-myth';
import type { RegistrySettings } from '../../configuration/registry-settings.ts';
import { retryWithFallbackAuthentication } from './metadata-authentication-retry.ts';
import { toRegistryPackagePath } from './registry-package-path.ts';
import {
    resolveMetadataAuthenticationOptions,
    resolveStageListingAuthenticationOptions,
    type AuthenticationResolution,
    type NpmFetchOptions
} from './registry-authentication-configuration.ts';
import {
    parseAbbreviatedPackageResponse,
    parseFullPackageResponse,
    type AbbreviatedPackageResponse,
    type FullPackageResponse
} from './registry-response-schemas.ts';
import type { TarballIntegrity } from './tarball-integrity.ts';

const notFoundStatusCode = 404;
const abbreviatedResponseAcceptHeader = 'application/vnd.npm.install-v1+json';

export type PackageVersionDetails = {
    readonly version: string;
    readonly tarballAddress: string;
    readonly tarballIntegrity: TarballIntegrity;
    readonly gitHead: string | undefined;
};

export type PackageReleaseMetadata = {
    readonly publishedAt?: Date | undefined;
    readonly tarballAddress: string;
    readonly tarballIntegrity: TarballIntegrity;
    readonly version: string;
    readonly gitHead: string | undefined;
};

export type PackageVersionReleaseMetadata = PackageReleaseMetadata & {
    readonly latestVersion: string | undefined;
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return value instanceof Object;
}

function isMissingPackageError(error: unknown): boolean {
    const statusCode = isRecord(error) ? error.statusCode : undefined;
    return statusCode === notFoundStatusCode;
}

function parseTimestamp(timestamp: string): Date {
    const parsed = new Date(timestamp);

    if (Number.isNaN(parsed.getTime())) {
        throw new TypeError(`Version publish time "${timestamp}" is not a valid timestamp`);
    }

    return parsed;
}

function isNonNegativeInteger(value: unknown): value is number {
    if (!Number.isSafeInteger(value)) {
        return false;
    }

    return Number(value) >= 0;
}

function parseStagedPackageListResponse(response: unknown): StagedPackageListResponse {
    if (!isRecord(response)) {
        throw new Error('Got an invalid response from registry stage API');
    }

    const { items, total } = response;
    if (!Array.isArray(items) || !isNonNegativeInteger(total)) {
        throw new Error('Got an invalid response from registry stage API');
    }

    return {
        items: items.map(function (item) {
            if (!isRecord(item) || typeof item.version !== 'string') {
                throw new Error('Got an invalid response from registry stage API');
            }
            return { version: item.version };
        }),
        total
    };
}

type PackageMetadataRequest<TPackageResponse extends Record<string, unknown>> = {
    readonly headers: Readonly<Record<string, string>> | undefined;
    readonly parsePackageResponse: (response: unknown) => TPackageResponse | undefined;
};

type PackageVersionDist = {
    readonly integrity?: unknown;
    readonly shasum?: unknown;
};

const abbreviatedPackageMetadataRequest: PackageMetadataRequest<AbbreviatedPackageResponse> = {
    parsePackageResponse: parseAbbreviatedPackageResponse,
    headers: { accept: abbreviatedResponseAcceptHeader }
};

const fullPackageMetadataRequest: PackageMetadataRequest<FullPackageResponse> = {
    parsePackageResponse: parseFullPackageResponse,
    headers: undefined
};

type StagedPackageListItem = {
    readonly version: string;
};

type StagedPackageListResponse = {
    readonly items: readonly StagedPackageListItem[];
    readonly total: number;
};

const stageListPageSize = 100;
const maximumStageListPages = 1000;

export type NpmFetch = {
    readonly javaScriptObjectNotation: (address: string, options: NpmFetchOptions) => Promise<unknown>;
};

async function fetchPackageMetadataResponse<TPackageResponse extends Record<string, unknown>>(
    npmFetch: NpmFetch,
    packageName: string,
    registrySettings: Readonly<RegistrySettings>,
    request: PackageMetadataRequest<TPackageResponse>
): Promise<unknown> {
    const authentication = resolveMetadataAuthenticationOptions(registrySettings);
    return retryWithFallbackAuthentication(registrySettings, authentication, async function ({ options }) {
        return npmFetch.javaScriptObjectNotation(`/${toRegistryPackagePath(packageName)}`, {
            ...options,
            headers: request.headers
        });
    });
}

function parsePackageMetadataResponse<TPackageResponse extends Record<string, unknown>>(
    response: unknown,
    request: PackageMetadataRequest<TPackageResponse>
): TPackageResponse {
    const result = request.parsePackageResponse(response);
    if (result === undefined) {
        throw new Error('Got an invalid response from registry API');
    }
    return result;
}

async function fetchAndParsePackageMetadata<TPackageResponse extends Record<string, unknown>>(
    npmFetch: NpmFetch,
    packageName: string,
    registrySettings: Readonly<RegistrySettings>,
    request: PackageMetadataRequest<TPackageResponse>
): Promise<Maybe<TPackageResponse>> {
    try {
        return Maybe.just(
            parsePackageMetadataResponse(
                await fetchPackageMetadataResponse(npmFetch, packageName, registrySettings, request),
                request
            )
        );
    } catch (error: unknown) {
        if (isMissingPackageError(error)) {
            return Maybe.nothing<TPackageResponse>();
        }
        throw error;
    }
}

function readTarballDigestField(
    value: unknown,
    fieldName: 'dist.integrity' | 'dist.shasum',
    packageName: string,
    version: string
): string | undefined {
    if (value === undefined) {
        return undefined;
    }

    if (typeof value === 'string' && value.length > 0) {
        return value;
    }

    throw new Error(`Registry returned invalid ${fieldName} for package "${packageName}" version "${version}"`);
}

function readTarballIntegrity(dist: PackageVersionDist, packageName: string, version: string): TarballIntegrity {
    return {
        integrity: readTarballDigestField(dist.integrity, 'dist.integrity', packageName, version),
        shasum: readTarballDigestField(dist.shasum, 'dist.shasum', packageName, version)
    };
}

function extractPackageVersionDetails(
    packageResponse: AbbreviatedPackageResponse,
    packageName: string,
    version: string
): Maybe<PackageVersionDetails> {
    const versionData = packageResponse.versions[version];
    if (versionData === undefined) {
        return Maybe.nothing();
    }

    return Maybe.just({
        version,
        tarballAddress: versionData.dist.tarball,
        tarballIntegrity: readTarballIntegrity(versionData.dist, packageName, version),
        gitHead: versionData.gitHead
    });
}

function extractLatestVersionDetails(
    packageResponse: AbbreviatedPackageResponse,
    packageName: string
): Maybe<PackageVersionDetails> {
    const latestVersion = packageResponse['dist-tags'].latest;
    if (latestVersion === undefined) {
        return Maybe.nothing();
    }

    const versionDetails = extractPackageVersionDetails(packageResponse, packageName, latestVersion);
    if (versionDetails.isNothing) {
        throw new Error(
            `Version "${latestVersion}" for package "${packageName}" has no entry in the registry response`
        );
    }

    return versionDetails;
}

function releaseMetadataFrom(
    packageResponse: FullPackageResponse,
    versionDetails: PackageVersionDetails
): PackageReleaseMetadata {
    const publishedAtTimestamp = packageResponse.time?.[versionDetails.version];

    return {
        version: versionDetails.version,
        tarballAddress: versionDetails.tarballAddress,
        tarballIntegrity: versionDetails.tarballIntegrity,
        publishedAt: publishedAtTimestamp === undefined ? undefined : parseTimestamp(publishedAtTimestamp),
        gitHead: versionDetails.gitHead
    };
}

export async function fetchLatestPackageVersion(
    npmFetch: NpmFetch,
    packageName: string,
    registrySettings: Readonly<RegistrySettings>
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
    npmFetch: NpmFetch,
    packageName: string,
    registrySettings: Readonly<RegistrySettings>
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

    return Maybe.just(releaseMetadataFrom(packageResponse.value, latestVersion.value));
}

export async function fetchPackageVersionReleaseMetadata(
    npmFetch: NpmFetch,
    packageName: string,
    version: string,
    registrySettings: Readonly<RegistrySettings>
): Promise<Maybe<PackageVersionReleaseMetadata>> {
    const packageResponse = await fetchAndParsePackageMetadata(
        npmFetch,
        packageName,
        registrySettings,
        fullPackageMetadataRequest
    );
    if (packageResponse.isNothing) {
        return Maybe.nothing();
    }

    const versionDetails = extractPackageVersionDetails(packageResponse.value, packageName, version);
    if (versionDetails.isNothing) {
        return Maybe.nothing();
    }

    return Maybe.just({
        ...releaseMetadataFrom(packageResponse.value, versionDetails.value),
        latestVersion: packageResponse.value['dist-tags'].latest
    });
}

async function fetchStagedPackageVersionPage(
    npmFetch: NpmFetch,
    authentication: AuthenticationResolution,
    packageName: string,
    page: number
): Promise<StagedPackageListResponse> {
    const searchParameters = new URLSearchParams({
        package: packageName,
        page: String(page),
        perPage: String(stageListPageSize)
    });
    return parseStagedPackageListResponse(
        await npmFetch.javaScriptObjectNotation(`/-/stage?${searchParameters.toString()}`, authentication.options)
    );
}

export async function fetchStagedPackageVersions(
    npmFetch: NpmFetch,
    packageName: string,
    registrySettings: Readonly<RegistrySettings>
): Promise<readonly string[]> {
    const authentication = resolveStageListingAuthenticationOptions(registrySettings);
    const versions: string[] = [];
    const pages = Array.from({ length: maximumStageListPages }, function (_value, index) {
        return index;
    });

    for (const page of pages) {
        const response = await fetchStagedPackageVersionPage(npmFetch, authentication, packageName, page);

        versions.push(...response.items.map(function (item) {
            return item.version;
        }));

        if (versions.length >= response.total || response.items.length === 0) {
            return versions;
        }
    }

    throw new Error(`Staged package listing exceeded ${maximumStageListPages} pages`);
}
