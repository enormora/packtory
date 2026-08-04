import { fake, type SinonSpy } from 'sinon';
import type { NpmFetch } from '../bundle-emitter/registry/package-metadata-fetcher.ts';

type FakeNpmFetch = Readonly<SinonSpy> & {
    readonly json: Readonly<SinonSpy> & { readonly stream: Readonly<SinonSpy>; };
    readonly pickRegistry: Readonly<SinonSpy>;
};

export const registryTarballBytes = Buffer.from('tarball-bytes');

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

export function fakeNpmFetchWithContentLength(contentLength: string | null): NpmFetch {
    const npmFetch: FakeNpmFetch = Object.assign(
        fake.resolves({
            buffer: fake.resolves(registryTarballBytes),
            headers: {
                get: fake(function (name: string) {
                    return name === 'content-length' ? contentLength : null;
                })
            }
        }),
        {
            json: Object.assign(fake(), { stream: fake() }),
            pickRegistry: fake()
        }
    );
    return npmFetch as unknown as NpmFetch;
}
