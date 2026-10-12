import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake } from 'sinon';
import type { RegistrySettings } from '../../config/registry-settings.ts';
import { registryTarballBytes, fetchTarballForTest } from '../../test-libraries/registry-fetch-fixtures.ts';

function fakeFetchWithContentLength(contentLength: string): typeof globalThis.fetch {
    return fake.resolves(new Response(registryTarballBytes, { headers: { 'content-length': contentLength } }));
}

const settings: RegistrySettings = { auth: { type: 'bearer-token', token: 'tok' } };
const tarballUrl = 'https://registry.npmjs.org/pkg-a/-/pkg-a-1.2.3.tgz';
const emptyTarballIntegrity = { integrity: undefined, shasum: undefined } as const;

suite('package-tarball-fetcher', function () {
    test('fetchPackageTarball returns the buffered tarball contents', async function () {
        const fetchImplementation = fake.resolves(new Response(registryTarballBytes));

        const result = await fetchTarballForTest(
            fetchImplementation,
            tarballUrl,
            emptyTarballIntegrity,
            settings
        );

        assert.deepStrictEqual(result, registryTarballBytes);
    });

    test('fetchPackageTarball rejects tarballs whose content-length exceeds the download limit', async function () {
        await assert.rejects(
            fetchTarballForTest(
                fakeFetchWithContentLength('268435457'),
                tarballUrl,
                emptyTarballIntegrity,
                settings
            ),
            /^Error: Refusing to download tarball larger than 268435456 bytes$/u
        );
    });

    test('fetchPackageTarball accepts tarballs whose content-length is exactly the download limit', async function () {
        const result = await fetchTarballForTest(
            fakeFetchWithContentLength('268435456'),
            tarballUrl,
            emptyTarballIntegrity,
            settings
        );

        assert.deepStrictEqual(result, registryTarballBytes);
    });

    test('fetchPackageTarball rejects a tarball URL whose host differs from the configured registry', async function () {
        const fetchImplementation = fake.resolves(new Response(registryTarballBytes));
        const expectedMessage =
            'Refusing to download tarball from "https://attacker.example" because it differs from the configured ' +
            'registry origin "https://registry.npmjs.org". A tampered registry response could redirect the request and ' +
            'exfiltrate publish credentials.';

        await assert.rejects(
            fetchTarballForTest(
                fetchImplementation,
                'https://attacker.example/pkg-a-1.2.3.tgz',
                emptyTarballIntegrity,
                settings
            ),
            { message: expectedMessage }
        );
        assert.strictEqual(fetchImplementation.callCount, 0);
    });

    test('fetchPackageTarball accepts a tarball URL whose host matches a custom configured registry', async function () {
        const customSettings: RegistrySettings = {
            registryUrl: 'https://registry.example.test/',
            auth: { type: 'bearer-token', token: 'tok' }
        };
        const fetchImplementation = fake.resolves(new Response(registryTarballBytes));

        const result = await fetchTarballForTest(
            fetchImplementation,
            'https://registry.example.test/pkg-a/-/pkg-a-1.2.3.tgz',
            emptyTarballIntegrity,
            customSettings
        );

        assert.deepStrictEqual(result, registryTarballBytes);
    });

    test('fetchPackageTarball rejects a malformed tarball URL', async function () {
        const fetchImplementation = fake.resolves(new Response(registryTarballBytes));

        await assert.rejects(
            fetchTarballForTest(
                fetchImplementation,
                'not-a-url',
                emptyTarballIntegrity,
                settings
            ),
            { message: 'Registry returned an invalid tarball URL: "not-a-url"' }
        );
        assert.strictEqual(fetchImplementation.callCount, 0);
    });
});
