import { Maybe } from 'true-myth';
import type { RegistrySettings } from '../config/registry-settings.ts';
import type { FileDescription } from '../file-manager/file-description.ts';
import { extractPackageTarball } from './extract-package-tarball.ts';
import type { PackageReleaseMetadata } from './registry/package-metadata-fetcher.ts';
import type { RegistryClient } from './registry/registry-client.ts';

export type PublishedReleaseArtifacts = {
    readonly publishedAt?: Date | undefined;
    readonly version: string;
    readonly gitHead: string | undefined;
    readonly files: readonly FileDescription[];
};

export async function fetchPublishedArtifactsFromMetadata(
    registryClient: RegistryClient,
    registrySettings: RegistrySettings,
    metadata: PackageReleaseMetadata
): Promise<PublishedReleaseArtifacts> {
    const tarball = await registryClient.fetchTarball(
        metadata.tarballUrl,
        metadata.tarballIntegrity,
        registrySettings
    );
    const files = await extractPackageTarball(tarball);
    return {
        version: metadata.version,
        files,
        publishedAt: metadata.publishedAt,
        gitHead: metadata.gitHead
    };
}

export async function fetchPublishedArtifacts(
    registryClient: RegistryClient,
    name: string,
    registrySettings: RegistrySettings
): Promise<Maybe<PublishedReleaseArtifacts>> {
    const latestVersion = await registryClient.fetchLatestReleaseMetadata(name, registrySettings);
    if (latestVersion.isNothing) {
        return Maybe.nothing();
    }
    return Maybe.just(await fetchPublishedArtifactsFromMetadata(registryClient, registrySettings, latestVersion.value));
}
