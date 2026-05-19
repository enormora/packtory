import { Maybe } from 'true-myth';
import type { RegistrySettings } from '../config/registry-settings.ts';
import type { FileDescription } from '../file-manager/file-description.ts';
import { extractPackageTarball } from './extract-package-tarball.ts';
import type { RegistryClient } from './registry/registry-client.ts';

export type PublishedReleaseArtifacts = {
    readonly version: string;
    readonly files: readonly FileDescription[];
};

export async function fetchPublishedArtifacts(
    registryClient: RegistryClient,
    name: string,
    registrySettings: RegistrySettings
): Promise<Maybe<PublishedReleaseArtifacts>> {
    const latestVersion = await registryClient.fetchLatestVersion(name, registrySettings);
    if (latestVersion.isNothing) {
        return Maybe.nothing();
    }
    const tarball = await registryClient.fetchTarball(latestVersion.value.tarballUrl, registrySettings);
    const files = await extractPackageTarball(tarball);
    return Maybe.just({ version: latestVersion.value.version, files });
}
