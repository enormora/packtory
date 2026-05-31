import type { RegistrySettings } from '../../config/registry-settings.ts';
import { npmRegistryUrl } from './registry-auth-config.ts';

function resolveConfiguredHost(registrySettings: Readonly<RegistrySettings>): string {
    return new URL(registrySettings.registryUrl ?? npmRegistryUrl).host;
}

function parseTarballHost(tarballUrl: string): string {
    try {
        return new URL(tarballUrl).host;
    } catch {
        throw new TypeError(`Registry returned an invalid tarball URL: "${tarballUrl}"`);
    }
}

function buildMismatchMessage(tarballHost: string, configuredHost: string): string {
    return (
        `Refusing to download tarball from "${tarballHost}" because it differs from the configured registry host ` +
        `"${configuredHost}". A tampered registry response could redirect the request and exfiltrate ` +
        'publish credentials.'
    );
}

export function assertTarballHostMatchesRegistry(
    tarballUrl: string,
    registrySettings: Readonly<RegistrySettings>
): void {
    const tarballHost = parseTarballHost(tarballUrl);
    const configuredHost = resolveConfiguredHost(registrySettings);

    if (tarballHost !== configuredHost) {
        throw new Error(buildMismatchMessage(tarballHost, configuredHost));
    }
}
