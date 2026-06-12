import type _npmFetch from 'npm-registry-fetch';
import type { Maybe } from 'true-myth';
import type { Clock } from '../../common/clock.ts';
import type { PublishSettings } from '../../config/publish-settings.ts';
import type { NpmOidcPublishAuth, RegistrySettings } from '../../config/registry-settings.ts';
import { publishedToRegistry, stagedForApproval, type PublicationOutcome } from '../publication-outcome.ts';
import { createOidcTokenExchanger } from './oidc-token-exchange.ts';
import {
    fetchLatestPackageReleaseMetadata,
    fetchPackageTarball,
    fetchLatestPackageVersion,
    fetchStagedPackageVersions,
    type PackageReleaseMetadata,
    type PackageVersionDetails
} from './package-metadata-fetcher.ts';
import { buildPublishOptionsForPublishSettings, remapPublishError } from './publish-settings-bridge.ts';

type PublishManifest = Readonly<Record<string, unknown>> & {
    readonly name: string;
    readonly version: string;
};
type PublishLibraryOptions = Readonly<Record<string, unknown>>;
type PublishOptionsForLibrary = PublishLibraryOptions & {
    readonly stage?: boolean;
};
type PublishOptionsWithOneTimePassword = PublishOptionsForLibrary & {
    readonly otpPrompt: (() => Promise<string | undefined>) | undefined;
};
type PublishPackageArguments = readonly [
    manifest: PublishManifest,
    tarData: Buffer,
    config: RegistrySettings,
    publishSettings: PublishSettings,
    stage: boolean
];

export type RegistryClientDependencies = {
    readonly npmFetch: typeof _npmFetch;
    readonly publish: (manifest: PublishManifest, tarData: Buffer, options?: PublishLibraryOptions) => Promise<unknown>;
    readonly fetch: typeof globalThis.fetch;
    readonly clock: Clock;
    readonly resolveIdToken: (auth: NpmOidcPublishAuth) => Promise<string>;
    readonly promptForOneTimePassword?: (() => Promise<string | undefined>) | undefined;
};

export type RegistryClient = {
    fetchLatestReleaseMetadata: (
        packageName: string,
        config: RegistrySettings
    ) => Promise<Maybe<PackageReleaseMetadata>>;
    fetchLatestVersion: (packageName: string, config: RegistrySettings) => Promise<Maybe<PackageVersionDetails>>;
    fetchStagedVersions: (packageName: string, config: RegistrySettings) => Promise<readonly string[]>;
    publishPackage: (...args: PublishPackageArguments) => Promise<PublicationOutcome>;
    fetchTarball: (tarballUrl: string, config: RegistrySettings) => Promise<Buffer>;
};

function hasStageId(response: unknown): response is { readonly stageId: string } {
    return (
        typeof response === 'object' &&
        response !== null &&
        'stageId' in response &&
        typeof response.stageId === 'string' &&
        response.stageId.length > 0
    );
}

function readStageId(response: unknown): string {
    if (!hasStageId(response)) {
        throw new Error('npm staged publish succeeded without returning a stage ID');
    }

    return response.stageId;
}

export function createRegistryClient(dependencies: Readonly<RegistryClientDependencies>): RegistryClient {
    const {
        npmFetch,
        publish,
        fetch: fetchImplementation,
        clock,
        promptForOneTimePassword,
        resolveIdToken
    } = dependencies;
    const oidcExchanger = createOidcTokenExchanger({ fetch: fetchImplementation, clock, resolveIdToken });

    return {
        async fetchTarball(tarballUrl, registrySettings) {
            return fetchPackageTarball(npmFetch, tarballUrl, registrySettings);
        },

        async publishPackage(...[manifest, tarData, registrySettings, publishSettings, stage]) {
            const authOptions = await oidcExchanger.resolveWriteAuthOptions(manifest.name, registrySettings);
            const publishOptionsFromSettings = buildPublishOptionsForPublishSettings(publishSettings);
            const publishOptions: PublishOptionsForLibrary = {
                defaultTag: 'latest',
                ...authOptions,
                ...publishOptionsFromSettings,
                ...(stage ? { stage: true } : {})
            };
            const publishOptionsWithOneTimePassword: PublishOptionsWithOneTimePassword = {
                ...publishOptions,
                otpPrompt: promptForOneTimePassword
            };
            const publishPromise =
                promptForOneTimePassword === undefined
                    ? publish(manifest, tarData, publishOptions)
                    : publish(manifest, tarData, publishOptionsWithOneTimePassword);

            try {
                const response = await publishPromise;
                return stage ? stagedForApproval(readStageId(response)) : publishedToRegistry;
            } catch (error: unknown) {
                throw remapPublishError(error, publishSettings);
            }
        },

        async fetchLatestVersion(packageName, registrySettings) {
            return fetchLatestPackageVersion(npmFetch, packageName, registrySettings);
        },

        async fetchStagedVersions(packageName, registrySettings) {
            return fetchStagedPackageVersions(npmFetch, packageName, registrySettings);
        },

        async fetchLatestReleaseMetadata(packageName, registrySettings) {
            return fetchLatestPackageReleaseMetadata(npmFetch, packageName, registrySettings);
        }
    };
}
