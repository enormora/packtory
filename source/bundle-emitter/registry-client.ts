import type _npmFetch from 'npm-registry-fetch';
import type { publish as _publish } from 'libnpmpublish';
import { Maybe } from 'true-myth';
import { z } from 'zod/mini';
import { safeParse } from '@schema-hub/zod-error-formatter';
import type { RegistrySettings } from '../config/registry-settings.js';
import type { BundlePackageJson } from '../version-manager/manifest/builder.js';

type PublishFunction = typeof _publish;

export type RegistryClientDependencies = {
    readonly npmFetch: typeof _npmFetch;
    readonly publish: PublishFunction;
};

export type RegistryClient = {
    fetchLatestVersion: (packageName: string, config: RegistrySettings) => Promise<Maybe<PackageVersionDetails>>;
    publishPackage: (manifest: Readonly<BundlePackageJson>, tarData: Buffer, config: RegistrySettings) => Promise<void>;
    fetchTarball: (tarballUrl: string, shasum: string) => Promise<Buffer>;
};

type FetchError = {
    readonly statusCode: number;
};

function isFetchError(error: unknown): error is FetchError {
    return typeof error === 'object' && error !== null && Object.hasOwn(error, 'statusCode');
}

function encodePackageName(name: string): string {
    return name.replace('/', '%2F');
}

const distTagsSchema = z.object({
    latest: z.optional(z.string())
});

const versionDataSchema = z.object({
    dist: z.object({ shasum: z.string(), tarball: z.string() })
});

const abbreviatedPackageResponseSchema = z.object({
    name: z.string(),
    'dist-tags': distTagsSchema,
    versions: z.record(z.string(), versionDataSchema)
});

type AbbreviatedPackageResponse = z.infer<typeof abbreviatedPackageResponseSchema>;

const httpStatusCode = {
    notFound: 404,
    forbidden: 403
};

export type PackageVersionDetails = {
    readonly version: string;
    readonly shasum: string;
    readonly tarballUrl: string;
};

type PublishFunctionParametersManifestIndex = 0;
type PublishManifest = Readonly<Parameters<PublishFunction>[PublishFunctionParametersManifestIndex]>;

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
            const result = safeParse(abbreviatedPackageResponseSchema, response);

            if (!result.success) {
                throw new Error('Got an invalid response from registry API');
            }
            return Maybe.just(result.data);
        } catch (error: unknown) {
            if (
                isFetchError(error) &&
                (error.statusCode === httpStatusCode.notFound || error.statusCode === httpStatusCode.forbidden)
            ) {
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
            // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- ok in this case
            await publish(manifest as unknown as PublishManifest, tarData, {
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
