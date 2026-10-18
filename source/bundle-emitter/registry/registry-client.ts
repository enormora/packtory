import type { Maybe } from 'true-myth';
import type { Clock } from '../../common/clock.ts';
import type { PublishSettings } from '../../configuration/publish-settings.ts';
import type {
    NpmOpenIdentityConnectPublishAuthentication,
    RegistrySettings
} from '../../configuration/registry-settings.ts';
import { publishedToRegistry, stagedForApproval, type PublicationOutcome } from '../publication-outcome.ts';
import { createOpenIdentityConnectTokenExchanger } from './open-identity-connect-token-exchange.ts';
import {
    fetchLatestPackageReleaseMetadata,
    fetchLatestPackageVersion,
    fetchPackageVersionReleaseMetadata,
    fetchStagedPackageVersions,
    type NpmFetch,
    type PackageReleaseMetadata,
    type PackageVersionDetails,
    type PackageVersionReleaseMetadata
} from './package-metadata-fetcher.ts';
import { buildPublishOptionsForPublishSettings, remapPublishError } from './publish-settings-bridge.ts';
import { fetchPackageTarball, type TarballFetcher } from './package-tarball-fetcher.ts';

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
type PublishPromise = Promise<unknown>;
type PublishPackageArguments = readonly [
    manifest: PublishManifest,
    tarData: Buffer,
    configuration: RegistrySettings,
    publishSettings: PublishSettings,
    stage: boolean
];

export type RegistryClientDependencies = {
    readonly npmFetch: NpmFetch;
    readonly publish: (manifest: PublishManifest, tarData: Buffer, options?: PublishLibraryOptions) => Promise<unknown>;
    readonly fetch: typeof globalThis.fetch;
    readonly clock: Clock;
    readonly resolveIdentifierToken: (authentication: NpmOpenIdentityConnectPublishAuthentication) => Promise<string>;
    readonly promptForOneTimePassword?: (() => Promise<string | undefined>) | undefined;
};

export type RegistryClient = {
    fetchLatestReleaseMetadata: (
        packageName: string,
        configuration: RegistrySettings
    ) => Promise<Maybe<PackageReleaseMetadata>>;
    fetchVersionReleaseMetadata: (
        packageName: string,
        version: string,
        configuration: RegistrySettings
    ) => Promise<Maybe<PackageVersionReleaseMetadata>>;
    fetchLatestVersion: (packageName: string, configuration: RegistrySettings) => Promise<Maybe<PackageVersionDetails>>;
    fetchStagedVersions: (packageName: string, configuration: RegistrySettings) => Promise<readonly string[]>;
    publishPackage: (...publishArguments: PublishPackageArguments) => Promise<PublicationOutcome>;
    readonly fetchTarball: TarballFetcher;
};

function isStageIdentifierRecord(response: unknown): response is Readonly<Record<'stageId', unknown>> {
    return (
        typeof response === 'object' &&
        response !== null &&
        Object.hasOwn(response, 'stageId')
    );
}

function hasStageIdentifier(response: unknown): response is { readonly stageId: string; } {
    return isStageIdentifierRecord(response) && typeof response.stageId === 'string' && response.stageId.length > 0;
}

function readStageIdentifier(response: unknown): string {
    if (!hasStageIdentifier(response)) {
        throw new Error('npm staged publish succeeded without returning a stage ID');
    }

    return response.stageId;
}

async function readPublishedPublicationOutcome(publishPromise: PublishPromise): Promise<PublicationOutcome> {
    await publishPromise;
    return publishedToRegistry;
}

async function readStagedPublicationOutcome(publishPromise: PublishPromise): Promise<PublicationOutcome> {
    return stagedForApproval(readStageIdentifier(await publishPromise));
}

async function readPublicationOutcome(
    publishPromise: PublishPromise,
    readOutcome: (publishPromise: PublishPromise) => Promise<PublicationOutcome>,
    publishSettings: PublishSettings
): Promise<PublicationOutcome> {
    try {
        return await readOutcome(publishPromise);
    } catch (error: unknown) {
        throw remapPublishError(error, publishSettings);
    }
}

export function createRegistryClient(dependencies: Readonly<RegistryClientDependencies>): RegistryClient {
    const {
        npmFetch,
        publish,
        fetch: fetchImplementation,
        clock,
        promptForOneTimePassword,
        resolveIdentifierToken
    } = dependencies;
    const openIdentityConnectExchanger = createOpenIdentityConnectTokenExchanger({
        fetch: fetchImplementation,
        clock,
        resolveIdentifierToken
    });

    return {
        async fetchTarball(tarballAddress, tarballIntegrity, registrySettings) {
            return fetchPackageTarball(
                { fetch: fetchImplementation, clock },
                tarballAddress,
                tarballIntegrity,
                registrySettings
            );
        },

        async publishPackage(...[ manifest, tarData, registrySettings, publishSettings, stage ]) {
            const authenticationOptions = await openIdentityConnectExchanger.resolveWriteAuthenticationOptions(
                manifest.name,
                registrySettings
            );
            const publishOptionsFromSettings = buildPublishOptionsForPublishSettings(publishSettings);
            const publishOptions: PublishOptionsForLibrary = {
                defaultTag: 'latest',
                ...authenticationOptions,
                ...publishOptionsFromSettings,
                ...stage ? { stage: true } : {}
            };
            const publishOptionsWithOneTimePassword: PublishOptionsWithOneTimePassword = {
                ...publishOptions,
                otpPrompt: promptForOneTimePassword
            };
            const publishOptionsForOneTimePassword = promptForOneTimePassword === undefined
                ? publishOptions
                : publishOptionsWithOneTimePassword;
            const publishPromise = publish(manifest, tarData, publishOptionsForOneTimePassword);
            const readOutcome = stage ? readStagedPublicationOutcome : readPublishedPublicationOutcome;

            return readPublicationOutcome(publishPromise, readOutcome, publishSettings);
        },

        async fetchLatestVersion(packageName, registrySettings) {
            return fetchLatestPackageVersion(npmFetch, packageName, registrySettings);
        },

        async fetchStagedVersions(packageName, registrySettings) {
            return fetchStagedPackageVersions(npmFetch, packageName, registrySettings);
        },

        async fetchLatestReleaseMetadata(packageName, registrySettings) {
            return fetchLatestPackageReleaseMetadata(npmFetch, packageName, registrySettings);
        },

        async fetchVersionReleaseMetadata(packageName, version, registrySettings) {
            return fetchPackageVersionReleaseMetadata(npmFetch, packageName, version, registrySettings);
        }
    };
}
