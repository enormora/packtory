import type _npmFetch from 'npm-registry-fetch';
import type { publish as _publish } from 'libnpmpublish';
import type { Maybe } from 'true-myth';
import type { Clock } from '../../common/clock.ts';
import type { PublishSettings } from '../../config/publish-settings.ts';
import type { NpmOidcPublishAuth, RegistrySettings } from '../../config/registry-settings.ts';
import type { PublishedPackageJson } from '../../published-package/published-package.ts';
import { createOidcTokenExchanger } from './oidc-token-exchange.ts';
import {
    fetchLatestPackageReleaseMetadata,
    fetchLatestPackageVersion,
    fetchPackageTarball,
    type PackageReleaseMetadata,
    type PackageVersionDetails
} from './package-metadata-fetcher.ts';
import { buildPublishOptionsForPublishSettings, remapPublishError } from './publish-settings-bridge.ts';

type PublishFunction = typeof _publish;

export type RegistryClientDependencies = {
    readonly npmFetch: typeof _npmFetch;
    readonly publish: PublishFunction;
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
    publishPackage: (
        manifest: Readonly<PublishedPackageJson>,
        tarData: Buffer,
        config: RegistrySettings,
        publishSettings: PublishSettings
    ) => Promise<void>;
    fetchTarball: (tarballUrl: string, config: RegistrySettings) => Promise<Buffer>;
};

type PublishManifest = Readonly<Parameters<PublishFunction>[0]>;
function toPublishManifest(manifest: Readonly<PublishedPackageJson>): PublishManifest {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- libnpmpublish expects @npm/types PackageJson, which is structurally compatible with our validated manifest
    return manifest as unknown as PublishManifest;
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

        async publishPackage(manifest, tarData, registrySettings, publishSettings) {
            const authOptions = await oidcExchanger.resolveWriteAuthOptions(manifest.name, registrySettings);
            const publishOptionsFromSettings = buildPublishOptionsForPublishSettings(publishSettings);
            const publishOptions = {
                defaultTag: 'latest',
                ...authOptions,
                ...publishOptionsFromSettings
            };
            const publishOptionsWithOneTimePassword = {
                ...publishOptions,
                otpPrompt: promptForOneTimePassword
            };
            const publishPromise =
                promptForOneTimePassword === undefined
                    ? publish(toPublishManifest(manifest), tarData, publishOptions)
                    : publish(toPublishManifest(manifest), tarData, publishOptionsWithOneTimePassword);

            try {
                await publishPromise;
            } catch (error: unknown) {
                throw remapPublishError(error, publishSettings);
            }
        },

        async fetchLatestVersion(packageName, registrySettings) {
            return fetchLatestPackageVersion(npmFetch, packageName, registrySettings);
        },

        async fetchLatestReleaseMetadata(packageName, registrySettings) {
            return fetchLatestPackageReleaseMetadata(npmFetch, packageName, registrySettings);
        }
    };
}
