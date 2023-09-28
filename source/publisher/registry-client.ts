import type _npmFetch from 'npm-registry-fetch';
import type { publish as _publish } from 'libnpmpublish';
import { Maybe } from 'true-myth';
import { object, string, optional, record, is, type Output } from 'valibot';
import type { BundlePackageJson } from '../bundler/bundle-description.js';

type PublishFunction = typeof _publish;

export type RegistryClientDependencies = {
    readonly npmFetch: typeof _npmFetch;
    readonly publish: PublishFunction;
};

export type RegistryClient = {
    fetchLatestVersion(packageName: string, config: Readonly<RegistrySettings>): Promise<Maybe<PackageVersionDetails>>;
    publishPackage(
        manifest: Readonly<BundlePackageJson>,
        tarData: Buffer,
        config: Readonly<RegistrySettings>
    ): Promise<void>;
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

const distTagsSchema = object({
    latest: optional(string())
});

const versionDataSchema = object({
    dist: object({ shasum: string() })
});

const abbreviatedPackageResponseSchema = object({
    name: string(),
    'dist-tags': distTagsSchema,
    versions: record(versionDataSchema)
});

type AbbreviatedPackageResponse = Readonly<Output<typeof abbreviatedPackageResponseSchema>>;

const httpStatusCode = {
    notFound: 404,
    forbidden: 403
};

export type PackageVersionDetails = {
    readonly version: string;
    readonly shasum: string;
};

export type RegistrySettings = {
    readonly token: string;
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
            if (!is(abbreviatedPackageResponseSchema, response)) {
                throw new Error('Got an invalid response from registry API');
            }
            return Maybe.just(response);
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
        async publishPackage(manifest, tarData, registrySettings) {
            await publish(manifest as unknown as PublishManifest, tarData, {
                defaultTag: 'latest',
                forceAuth: {
                    alwaysAuth: true,
                    token: registrySettings.token
                }
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
                    shasum: versionData.dist.shasum
                });
            }

            return Maybe.nothing();
        }
    };
}
