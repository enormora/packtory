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
    fetchShasum(packageName: string, version: string): Promise<string>;
    fetchLatestVersion(packageName: string): Promise<Maybe<string>>;
    publishPackage(manifest: SetRequired<PackageJson, 'name' | 'version'>, tarData: Buffer): Promise<void>;
}

interface FetchError {
    readonly statusCode: number;
}

function isFetchError(error: unknown): error is FetchError {
    return Object.prototype.hasOwnProperty.call(error, 'statusCode');
}

const distTagsResponseSchema = object({
    latest: optional(string())
});

const versionDataSchema = object({
    dist: object({shasum: string()})
});

const packageResponseSchema = object({
    versions: record(versionDataSchema)
});

export function createRegistryClient(dependencies: RegistryClientDependencies): RegistryClient {
    const {npmFetch, publish} = dependencies;

    async function fetchRegistryEndpoint(endpoint: string): Promise<unknown> {
        return npmFetch.json(endpoint);
    }


    return {
        async publishPackage(manifest, tarData) {
            await publish(manifest as unknown as Parameters<PublishFunction>[ 0 ], tarData);
        },

        async fetchShasum(packageName, version) {
            const endpointUri = `/${encodeURIComponent(packageName)}/`;
            const response = await fetchRegistryEndpoint(endpointUri);

            if (!is(packageResponseSchema, response)) {
                throw new Error('Got an invalid response from registry API');
            }

            const versionData = response.versions[ version ];

            if (versionData) {
                return versionData.dist.shasum;
            }

            throw new Error(`Can’t find version ${version} for package ${packageName}`);
        },

        async fetchLatestVersion(packageName) {
            const endpointUri = `${encodeURIComponent(packageName)}`;

            try {
                const response = await fetchRegistryEndpoint(`/-/package/${endpointUri}/dist-tags`);

                if (!is(distTagsResponseSchema, response)) {
                    throw new Error('Got an invalid response from registry API');
                }

                if (response.latest) {
                    return Maybe.just(response.latest);
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
