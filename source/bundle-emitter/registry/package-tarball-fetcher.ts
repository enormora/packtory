import type { RegistrySettings } from '../../config/registry-settings.ts';
import type { Clock } from '../../common/clock.ts';
import { retryWithFallbackAuth } from './metadata-auth-retry.ts';
import { resolveMetadataAuthOptions, type AuthResolution } from './registry-auth-config.ts';
import { assertTarballIntegrity, type TarballIntegrity } from './tarball-integrity.ts';
import { maxDownloadedTarballBytes, readTarballResponse } from './tarball-response.ts';
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
    url: string,
    integrity: TarballIntegrity,
    settings: RegistrySettings
) => Promise<Buffer>;

type TarballRequest = {
    readonly url: string;
    readonly auth: AuthResolution;
    readonly registrySettings: Readonly<RegistrySettings>;
    readonly signal: AbortSignal;
};

type TarballFetchDependencies = {
    readonly fetch: typeof globalThis.fetch;
    readonly clock: Pick<Clock, 'clearTimeout' | 'setTimeout'>;
};

async function redirectedTarballUrl(response: Response, url: string): Promise<string> {
    await response.body?.cancel();
    const location = response.headers.get('location');
    if (location === null) {
        throw new Error('Registry tarball redirect is missing a Location header');
    }
    const { href } = new URL(location, url);
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
    let { url } = request;
    for (let redirects = 0; redirects <= maximumRedirects; redirects += 1) {
        assertTarballOriginMatchesRegistry(url, request.registrySettings);
        const response = await fetchImplementation(url, {
            headers: request.auth.authorization === undefined ? {} : { Authorization: request.auth.authorization },
            redirect: 'manual',
            signal: request.signal
        });
        if (!redirectStatuses.has(response.status)) {
            await assertTarballResponseSuccess(response);
            return response;
        }
        url = await redirectedTarballUrl(response, url);
    }
    throw new Error(`Registry tarball download exceeded ${maximumRedirects} redirects`);
}

export async function fetchPackageTarball(
    dependencies: TarballFetchDependencies,
    tarballUrl: string,
    tarballIntegrity: TarballIntegrity,
    registrySettings: Readonly<RegistrySettings>
): Promise<Buffer> {
    assertTarballOriginMatchesRegistry(tarballUrl, registrySettings);
    const controller = new AbortController();
    const timeout = dependencies.clock.setTimeout(function () {
        controller.abort(new Error(`Registry tarball download exceeded ${tarballRequestTimeoutMilliseconds} ms`));
    }, tarballRequestTimeoutMilliseconds);
    try {
        const response = await retryWithFallbackAuth(
            registrySettings,
            resolveMetadataAuthOptions(registrySettings),
            async function (auth) {
                return requestTarball(dependencies.fetch, {
                    url: tarballUrl,
                    auth,
                    registrySettings,
                    signal: controller.signal
                });
            }
        );
        const tarball = await readTarballResponse(response, maxDownloadedTarballBytes);
        assertTarballIntegrity(tarball, tarballIntegrity);
        return tarball;
    } finally {
        dependencies.clock.clearTimeout(timeout);
    }
}
