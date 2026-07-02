import type _npmFetch from 'npm-registry-fetch';
import { Maybe } from 'true-myth';
import type { RegistrySettings } from '../../config/registry-settings.ts';
import { retryWithFallbackAuth } from './metadata-auth-retry.ts';
import { toRegistryPackagePath } from './registry-package-path.ts';
import {
    resolveMetadataAuthOptions,
    resolveStageListingAuthOptions,
    type AuthResolution,
    type NpmFetchOptions
} from './registry-auth-config.ts';
import {
    parseAbbreviatedPackageResponse,
    parseFullPackageResponse,
    type AbbreviatedPackageResponse,
    type FullPackageResponse
} from './registry-response-schemas.ts';
import { assertTarballOriginMatchesRegistry } from './validate-tarball-host.ts';

const notFoundStatusCode = 404;
const forbiddenStatusCode = 403;
const abbreviatedResponseAcceptHeader = 'application/vnd.npm.install-v1+json';
const maxDownloadedTarballBytes = 268_435_456;

export type PackageVersionDetails = {
    readonly version: string;
    readonly tarballUrl: string;
    readonly gitHead: string | undefined;
};

export type PackageReleaseMetadata = {
    readonly publishedAt?: Date | undefined;
    readonly tarballUrl: string;
    readonly version: string;
    readonly gitHead: string | undefined;
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return value instanceof Object;
}

type BufferedRegistryResponse = {
    readonly buffer: () => Promise<Buffer>;
    readonly headers: { readonly get: (name: string) => string | null; } | undefined;
};

function assertDownloadedTarballSize(size: number): void {
    if (size > maxDownloadedTarballBytes) {
        throw new Error(`Refusing to download tarball larger than ${maxDownloadedTarballBytes} bytes`);
    }
}

function assertContentLengthWithinDownloadLimit(response: BufferedRegistryResponse): void {
    assertDownloadedTarballSize(Number(response.headers?.get('content-length')));
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

type NpmFetchResponse = Awaited<ReturnType<typeof _npmFetch>>;
export type NpmFetch = {
    (url: string, options?: NpmFetchOptions): Promise<NpmFetchResponse>;
    readonly json: typeof _npmFetch.json;
};

async function fetchPackageMetadataResponse<TPackageResponse extends Record<string, unknown>>(
    npmFetch: NpmFetch,
    packageName: string,
    registrySettings: Readonly<RegistrySettings>,
    request: PackageMetadataRequest<TPackageResponse>
): Promise<unknown> {
    const auth = resolveMetadataAuthOptions(registrySettings);
    return retryWithFallbackAuth(registrySettings, auth, async function (options) {
        return npmFetch.json(`/${toRegistryPackagePath(packageName)}`, {
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

    return Maybe.just({ version: latestVersion, tarballUrl: versionData.dist.tarball, gitHead: versionData.gitHead });
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

    const publishedAtTimestamp = packageResponse.value.time?.[latestVersion.value.version];

    return Maybe.just({
        version: latestVersion.value.version,
        tarballUrl: latestVersion.value.tarballUrl,
        publishedAt: publishedAtTimestamp === undefined ? undefined : parseTimestamp(publishedAtTimestamp),
        gitHead: latestVersion.value.gitHead
    });
}

async function fetchStagedPackageVersionPage(
    npmFetch: NpmFetch,
    auth: AuthResolution,
    packageName: string,
    page: number
): Promise<StagedPackageListResponse> {
    const searchParams = new URLSearchParams({
        package: packageName,
        page: String(page),
        perPage: String(stageListPageSize)
    });
    return parseStagedPackageListResponse(await npmFetch.json(`/-/stage?${searchParams.toString()}`, auth.options));
}

export async function fetchStagedPackageVersions(
    npmFetch: NpmFetch,
    packageName: string,
    registrySettings: Readonly<RegistrySettings>
): Promise<readonly string[]> {
    const auth = resolveStageListingAuthOptions(registrySettings);
    const versions: string[] = [];
    const pages = Array.from({ length: maximumStageListPages }, function (_value, index) {
        return index;
    });

    for (const page of pages) {
        const response = await fetchStagedPackageVersionPage(npmFetch, auth, packageName, page);

        versions.push(...response.items.map(function (item) {
            return item.version;
        }));

        if (versions.length >= response.total || response.items.length === 0) {
            return versions;
        }
    }

    throw new Error(`Staged package listing exceeded ${maximumStageListPages} pages`);
}

export async function fetchPackageTarball(
    npmFetch: NpmFetch,
    tarballUrl: string,
    registrySettings: Readonly<RegistrySettings>
): Promise<Buffer> {
    assertTarballOriginMatchesRegistry(tarballUrl, registrySettings);
    const auth = resolveMetadataAuthOptions(registrySettings);
    const response = await retryWithFallbackAuth(registrySettings, auth, async function (options) {
        return npmFetch(tarballUrl, options);
    });
    assertContentLengthWithinDownloadLimit(response);
    const tarball = await response.buffer();
    assertDownloadedTarballSize(tarball.length);
    return tarball;
}
