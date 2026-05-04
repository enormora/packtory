/* eslint-disable complexity, max-statements -- response parsing intentionally validates the full registry payload in one place */
import type _npmFetch from 'npm-registry-fetch';
import type { publish as _publish } from 'libnpmpublish';
import { Maybe } from 'true-myth';
import type { RegistrySettings } from '../config/registry-settings.ts';
import type { BundlePackageJson } from '../version-manager/versioned-bundle.ts';

type PublishFunction = typeof _publish;
const notFoundStatusCode = 404;
const forbiddenStatusCode = 403;

export type RegistryClientDependencies = {
    readonly npmFetch: typeof _npmFetch;
    readonly publish: PublishFunction;
};

export type RegistryClient = {
    fetchLatestVersion: (packageName: string, config: RegistrySettings) => Promise<Maybe<PackageVersionDetails>>;
    publishPackage: (manifest: Readonly<BundlePackageJson>, tarData: Buffer, config: RegistrySettings) => Promise<void>;
    fetchTarball: (tarballUrl: string, shasum: string) => Promise<Buffer>;
};

function encodePackageName(name: string): string {
    return name.replace('/', '%2F');
}

type AbbreviatedPackageResponse = {
    readonly name: string;
    readonly 'dist-tags': {
        readonly latest?: string | undefined;
    };
    readonly versions: Readonly<
        Record<string, { readonly dist: { readonly shasum: string; readonly tarball: string } }>
    >;
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return value instanceof Object;
}

function parseAbbreviatedPackageResponse(response: unknown): AbbreviatedPackageResponse | undefined {
    const responseRecord = isRecord(response) ? response : undefined;

    if (typeof responseRecord?.name !== 'string') {
        return undefined;
    }

    const distTags = responseRecord['dist-tags'];
    if (!isRecord(distTags)) {
        return undefined;
    }

    if (distTags.latest !== undefined && typeof distTags.latest !== 'string') {
        return undefined;
    }

    if (!isRecord(responseRecord.versions)) {
        return undefined;
    }

    const versions: Record<string, { dist: { shasum: string; tarball: string } }> = {};

    for (const [version, value] of Object.entries(responseRecord.versions)) {
        if (!isRecord(value) || !isRecord(value.dist)) {
            return undefined;
        }

        if (typeof value.dist.shasum !== 'string' || typeof value.dist.tarball !== 'string') {
            return undefined;
        }

        versions[version] = { dist: { shasum: value.dist.shasum, tarball: value.dist.tarball } };
    }

    return {
        name: responseRecord.name,
        'dist-tags': { latest: distTags.latest },
        versions
    };
}

export type PackageVersionDetails = {
    readonly version: string;
    readonly shasum: string;
    readonly tarballUrl: string;
};

type PublishManifest = Readonly<Parameters<PublishFunction>[0]>;

function toPublishManifest(manifest: Readonly<BundlePackageJson>): PublishManifest {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- libnpmpublish expects @npm/types PackageJson, which is structurally compatible with our validated manifest
    return manifest as unknown as PublishManifest;
}

export function createRegistryClient(dependencies: Readonly<RegistryClientDependencies>): RegistryClient {
    const { npmFetch, publish } = dependencies;

    async function fetchRegistryEndpoint(
        endpoint: string,
        registrySettings: Readonly<RegistrySettings>
    ): Promise<unknown> {
        const acceptHeaderForFetchingAbbreviatedResponse = 'application/vnd.npm.install-v1+json';

        return npmFetch.json(endpoint, {
            forceAuth: {
                alwaysAuth: true,
                token: registrySettings.token
            },
            registry: registrySettings.registryUrl,
            headers: { accept: acceptHeaderForFetchingAbbreviatedResponse }
        });
    }

    async function fetchPackage(
        packageName: string,
        registrySettings: RegistrySettings
    ): Promise<Maybe<AbbreviatedPackageResponse>> {
        const endpointUri = `/${encodePackageName(packageName)}`;
        try {
            const response = await fetchRegistryEndpoint(endpointUri, registrySettings);
            const result = parseAbbreviatedPackageResponse(response);

            if (result === undefined) {
                throw new Error('Got an invalid response from registry API');
            }

            return Maybe.just(result);
        } catch (error: unknown) {
            const statusCode = isRecord(error) ? error.statusCode : undefined;
            if (statusCode === notFoundStatusCode || statusCode === forbiddenStatusCode) {
                return Maybe.nothing();
            }

            throw error;
        }
    }

    return {
        async fetchTarball(tarballUrl) {
            const response = await npmFetch(tarballUrl);
            return response.buffer();
        },

        async publishPackage(manifest, tarData, registrySettings) {
            await publish(toPublishManifest(manifest), tarData, {
                defaultTag: 'latest',
                forceAuth: {
                    alwaysAuth: true,
                    token: registrySettings.token
                },
                registry: registrySettings.registryUrl
            });
        },

        async fetchLatestVersion(packageName, registrySettings) {
            const packageResponse = await fetchPackage(packageName, registrySettings);

            if (packageResponse.isNothing) {
                return Maybe.nothing();
            }

            const latestVersion = packageResponse.value['dist-tags'].latest;
            if (latestVersion !== undefined) {
                const versionData = packageResponse.value.versions[latestVersion];
                if (versionData === undefined) {
                    throw new Error(`Version "${latestVersion}" for package "${packageName}" is missing a shasum`);
                }

                return Maybe.just({
                    version: latestVersion,
                    shasum: versionData.dist.shasum,
                    tarballUrl: versionData.dist.tarball
                });
            }

            return Maybe.nothing();
        }
    };
}
