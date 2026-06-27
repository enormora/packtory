import type { RegistrySettings } from '../../config/registry-settings.ts';
import { npmRegistryUrl } from './registry-auth-config.ts';

function resolveConfiguredOrigin(registrySettings: Readonly<RegistrySettings>): string {
    return new URL(registrySettings.registryUrl ?? npmRegistryUrl).origin;
}

function parseTarballOrigin(tarballUrl: string): string {
    try {
        return new URL(tarballUrl).origin;
    } catch {
        throw new TypeError(`Registry returned an invalid tarball URL: "${tarballUrl}"`);
    }
}

function buildMismatchMessage(tarballOrigin: string, configuredOrigin: string): string {
    return (
        `Refusing to download tarball from "${tarballOrigin}" because it differs from the configured registry origin ` +
        `"${configuredOrigin}". A tampered registry response could redirect the request and exfiltrate ` +
        'publish credentials.'
    );
}

export function assertTarballOriginMatchesRegistry(
    tarballUrl: string,
    registrySettings: Readonly<RegistrySettings>
): void {
    const tarballOrigin = parseTarballOrigin(tarballUrl);
    const configuredOrigin = resolveConfiguredOrigin(registrySettings);

    if (tarballOrigin !== configuredOrigin) {
        throw new Error(buildMismatchMessage(tarballOrigin, configuredOrigin));
    }
}
