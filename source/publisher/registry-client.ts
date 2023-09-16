import _npmFetch from 'npm-registry-fetch';
import {publish as _publish} from 'libnpmpublish';
import {Maybe} from 'true-myth'
import {object, string, optional, record, is} from 'valibot';
import {PackageJson, SetRequired} from 'type-fest';

type PublishFunction = typeof _publish;

export interface RegistryClientDependencies {
    npmFetch: typeof _npmFetch
    publish: PublishFunction
}

export interface RegistryClient {
    fetchLatestVersion(packageName: string, config: RegistrySettings): Promise<Maybe<PackageVersionDetails>>;
    publishPackage(manifest: SetRequired<PackageJson, 'name' | 'version'>, tarData: Buffer, config: RegistrySettings): Promise<void>;
}

interface FetchError {
    readonly statusCode: number;
}

function isFetchError(error: unknown): error is FetchError {
    return Object.prototype.hasOwnProperty.call(error, 'statusCode');
}

function encodePackageName(name: string): string {
    return name.replace('/', '%2F');
}

const distTagsSchema = object({
    latest: optional(string())
});

const versionDataSchema = object({
    dist: object({shasum: string()})
});

const abbreviatedPackageResponseSchema = object({
    name: string(),
    'dist-tags': distTagsSchema,
    versions: record(versionDataSchema)
});

export interface PackageVersionDetails {
    version: string;
    shasum: string;
}

export interface RegistrySettings {
    token: string;
}

export function createRegistryClient(dependencies: RegistryClientDependencies): RegistryClient {
    const {npmFetch, publish} = dependencies;

    async function fetchRegistryEndpoint(endpoint: string, registrySettings: RegistrySettings): Promise<unknown> {
        const acceptHeaderForFetchingAbbreviatedResponse = 'application/vnd.npm.install-v1+json'

        return npmFetch.json(endpoint, {
            forceAuth: {
                alwaysAuth: true,
                token: registrySettings.token,
            },
            headers: {accept: acceptHeaderForFetchingAbbreviatedResponse}
        });
    }


    return {
        async publishPackage(manifest, tarData, registrySettings) {
            await publish(manifest as unknown as Parameters<PublishFunction>[ 0 ], tarData, {
                defaultTag: 'latest',
                forceAuth: {
                    alwaysAuth: true,
                    token: registrySettings.token
                }
            });
        },

        async fetchLatestVersion(packageName, registrySettings) {
            const endpointUri = `/${encodePackageName(packageName)}`;

            try {
                const response = await fetchRegistryEndpoint(endpointUri, registrySettings);
                if (!is(abbreviatedPackageResponseSchema, response)) {
                    throw new Error('Got an invalid response from registry API');
                }

                const latestVersion = response[ 'dist-tags' ].latest;
                if (latestVersion) {
                    const versionData = response.versions[ latestVersion ];
                    if (!versionData) {
                        throw new Error(`The version information about the latest version ${latestVersion} for package ${packageName} is missing`);
                    }

                    return Maybe.just({
                        version: latestVersion,
                        shasum: versionData.dist.shasum
                    });
                }

                return Maybe.nothing();
            } catch (error: unknown) {
                if (isFetchError(error) && (error.statusCode === 404 || error.statusCode === 403)) {
                    return Maybe.nothing();
                }

                throw error;
            }
        }
    };
}
