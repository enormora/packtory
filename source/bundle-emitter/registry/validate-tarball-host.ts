import type { RegistrySettings } from '../../configuration/registry-settings.ts';
import { npmRegistryAddress } from './registry-authentication-configuration.ts';

function resolveConfiguredOrigin(registrySettings: Readonly<RegistrySettings>): string {
    const configuredAddress = new URL(registrySettings.registryAddress ?? npmRegistryAddress);
    return configuredAddress.origin;
}

function parseTarballOrigin(tarballAddress: string): string {
    try {
        const parsedAddress = new URL(tarballAddress);
        return parsedAddress.origin;
    } catch {
        throw new TypeError(`Registry returned an invalid tarball URL: "${tarballAddress}"`);
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
    tarballAddress: string,
    registrySettings: Readonly<RegistrySettings>
): void {
    const tarballOrigin = parseTarballOrigin(tarballAddress);
    const configuredOrigin = resolveConfiguredOrigin(registrySettings);

    if (tarballOrigin !== configuredOrigin) {
        throw new Error(buildMismatchMessage(tarballOrigin, configuredOrigin));
    }
}
