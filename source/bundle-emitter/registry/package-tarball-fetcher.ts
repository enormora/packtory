import type { RegistrySettings } from '../../configuration/registry-settings.ts';
import type { Clock } from '../../common/clock.ts';
import { retryWithFallbackAuthentication } from './metadata-authentication-retry.ts';
import {
    resolveMetadataAuthenticationOptions,
    type AuthenticationResolution
} from './registry-authentication-configuration.ts';
import { assertTarballIntegrity, type TarballIntegrity } from './tarball-integrity.ts';
import { maximumDownloadedTarballBytes, readTarballResponse } from './tarball-response.ts';
import { assertTarballOriginMatchesRegistry } from './validate-tarball-host.ts';

const maximumRedirects = 20;
const tarballRequestTimeoutMilliseconds = 30_000;
const movedPermanentlyStatus = 301;
const foundStatus = 302;
const seeOtherStatus = 303;
const temporaryRedirectStatus = 307;
const permanentRedirectStatus = 308;
const redirectStatuses: ReadonlySet<number> = new Set([
    movedPermanentlyStatus,
    foundStatus,
    seeOtherStatus,
    temporaryRedirectStatus,
    permanentRedirectStatus
]);

export type TarballFetcher = (
    address: string,
    integrity: TarballIntegrity,
    settings: RegistrySettings
) => Promise<Buffer>;

type TarballRequest = {
    readonly address: string;
    readonly authentication: AuthenticationResolution;
    readonly registrySettings: Readonly<RegistrySettings>;
    readonly signal: AbortSignal;
};

type TarballFetchDependencies = {
    readonly fetch: typeof globalThis.fetch;
    readonly clock: Pick<Clock, 'clearTimeout' | 'setTimeout'>;
};

async function redirectedTarballAddress(response: Response, address: string): Promise<string> {
    await response.body?.cancel();
    const location = response.headers.get('location');
    if (location === null) {
        throw new Error('Registry tarball redirect is missing a Location header');
    }
    const { href } = new URL(location, address);
    return href;
}

async function assertTarballResponseSuccess(response: Response): Promise<void> {
    if (!response.ok) {
        await response.body?.cancel();
        throw Object.assign(new Error(`Tarball download failed with status ${response.status}`), {
            statusCode: response.status
        });
    }
}

async function requestTarball(
    fetchImplementation: typeof globalThis.fetch,
    request: TarballRequest
): Promise<Response> {
    let { address } = request;
    for (let redirects = 0; redirects <= maximumRedirects; redirects += 1) {
        assertTarballOriginMatchesRegistry(address, request.registrySettings);
        const response = await fetchImplementation(address, {
            headers: request.authentication.authorization === undefined
                ? {}
                : { Authorization: request.authentication.authorization },
            redirect: 'manual',
            signal: request.signal
        });
        if (!redirectStatuses.has(response.status)) {
            await assertTarballResponseSuccess(response);
            return response;
        }
        address = await redirectedTarballAddress(response, address);
    }
    throw new Error(`Registry tarball download exceeded ${maximumRedirects} redirects`);
}

export async function fetchPackageTarball(
    dependencies: TarballFetchDependencies,
    tarballAddress: string,
    tarballIntegrity: TarballIntegrity,
    registrySettings: Readonly<RegistrySettings>
): Promise<Buffer> {
    assertTarballOriginMatchesRegistry(tarballAddress, registrySettings);
    const controller = new AbortController();
    const timeout = dependencies.clock.setTimeout(function () {
        controller.abort(new Error(`Registry tarball download exceeded ${tarballRequestTimeoutMilliseconds} ms`));
    }, tarballRequestTimeoutMilliseconds);
    try {
        const response = await retryWithFallbackAuthentication(
            registrySettings,
            resolveMetadataAuthenticationOptions(registrySettings),
            async function (authentication) {
                return requestTarball(dependencies.fetch, {
                    address: tarballAddress,
                    authentication,
                    registrySettings,
                    signal: controller.signal
                });
            }
        );
        const tarball = await readTarballResponse(response, maximumDownloadedTarballBytes);
        assertTarballIntegrity(tarball, tarballIntegrity);
        return tarball;
    } finally {
        dependencies.clock.clearTimeout(timeout);
    }
}
