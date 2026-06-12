import { Maybe } from 'true-myth';
import type { RegistrySettings } from '../config/registry-settings.ts';
import type { FileDescription } from '../file-manager/file-description.ts';
import { extractPackageTarball } from './extract-package-tarball.ts';
import type { RegistryClient } from './registry/registry-client.ts';

export type PublishedReleaseArtifacts = {
    readonly publishedAt?: Date | undefined;
    readonly version: string;
    readonly gitHead: string | undefined;
    readonly files: readonly FileDescription[];
};

export async function fetchPublishedArtifacts(
    registryClient: RegistryClient,
    name: string,
    registrySettings: RegistrySettings
): Promise<Maybe<PublishedReleaseArtifacts>> {
    const latestVersion = await registryClient.fetchLatestReleaseMetadata(name, registrySettings);
    if (latestVersion.isNothing) {
        return Maybe.nothing();
    }
    const tarball = await registryClient.fetchTarball(latestVersion.value.tarballUrl, registrySettings);
    const files = await extractPackageTarball(tarball);
    return Maybe.just({
        version: latestVersion.value.version,
        files,
        publishedAt: latestVersion.value.publishedAt,
        gitHead: latestVersion.value.gitHead
    });
}
