import { fake, type SinonSpy } from 'sinon';
import type { NpmFetch } from '../bundle-emitter/registry/package-metadata-fetcher.ts';
import { fetchPackageTarball } from '../bundle-emitter/registry/package-tarball-fetcher.ts';
import type { TarballIntegrity } from '../bundle-emitter/registry/tarball-integrity.ts';
import type { RegistrySettings } from '../config/registry-settings.ts';
import { createFakeClock } from './fake-clock.ts';

type FakeNpmFetch = Readonly<SinonSpy> & {
    readonly json: Readonly<SinonSpy> & { readonly stream: Readonly<SinonSpy>; };
    readonly pickRegistry: Readonly<SinonSpy>;
};

export const registryTarballBytes = Buffer.from('tarball-bytes');

export async function fetchTarballForTest(
    fetchImplementation: typeof globalThis.fetch,
    url: string,
    integrity: TarballIntegrity,
    settings: RegistrySettings
): Promise<Buffer> {
    return fetchPackageTarball({ fetch: fetchImplementation, clock: createFakeClock() }, url, integrity, settings);
}

export function fakeNpmFetch(
    json: Readonly<SinonSpy>,
    buffer: Readonly<SinonSpy> = fake.resolves(Buffer.from([]))
): NpmFetch {
    const npmFetch: FakeNpmFetch = Object.assign(fake.resolves({ buffer }), {
        json: Object.assign(json, { stream: fake() }),
        pickRegistry: fake()
    });
    return npmFetch as unknown as NpmFetch;
}
