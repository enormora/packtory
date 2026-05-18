import assert from 'node:assert';
import { test } from 'mocha';
import { fake, type SinonSpy } from 'sinon';
import type _npmFetch from 'npm-registry-fetch';
import type { RegistrySettings } from '../../config/registry-settings.ts';
import { fetchLatestPackageVersion, fetchPackageTarball } from './package-metadata-fetcher.ts';

type FakeNpmFetch = SinonSpy & { json: SinonSpy };

const settings: RegistrySettings = { auth: { type: 'bearer-token', token: 'tok' } };

function fakeNpmFetch(json: SinonSpy, buffer: SinonSpy = fake.resolves(Buffer.from([]))): typeof _npmFetch {
    const npmFetch: FakeNpmFetch = fake.resolves({ buffer }) as FakeNpmFetch;
    npmFetch.json = json;
    return npmFetch as unknown as typeof _npmFetch;
}

async function expectError(npmFetch: typeof _npmFetch, expectedMessage: string): Promise<void> {
    try {
        await fetchLatestPackageVersion(npmFetch, 'pkg-a', settings);
        assert.fail('Expected fetchLatestPackageVersion() to throw but it did not');
    } catch (error: unknown) {
        assert.strictEqual((error as Error).message, expectedMessage);
    }
}

test('fetchLatestPackageVersion returns the latest version details when the registry response is valid', async () => {
    const result = await fetchLatestPackageVersion(
        fakeNpmFetch(
            fake.resolves({
                name: 'pkg-a',
                'dist-tags': { latest: '1.2.3' },
                versions: { '1.2.3': { dist: { tarball: 'https://example.com/pkg-a-1.2.3.tgz' } } }
            })
        ),
        'pkg-a',
        settings
    );

    assert.deepStrictEqual(result.unwrapOr({ version: '', tarballUrl: '' }), {
        version: '1.2.3',
        tarballUrl: 'https://example.com/pkg-a-1.2.3.tgz'
    });
});

test('fetchLatestPackageVersion returns Nothing when the registry has no latest dist-tag', async () => {
    const result = await fetchLatestPackageVersion(
        fakeNpmFetch(fake.resolves({ name: 'pkg-a', 'dist-tags': {}, versions: {} })),
        'pkg-a',
        settings
    );

    assert.strictEqual(result.isNothing, true);
});

test('fetchLatestPackageVersion returns Nothing when the registry responds with a missing-package status', async () => {
    for (const statusCode of [404, 403] as const) {
        const result = await fetchLatestPackageVersion(
            fakeNpmFetch(fake.rejects(Object.assign(new Error(`status ${statusCode}`), { statusCode }))),
            'pkg-a',
            settings
        );
        assert.strictEqual(result.isNothing, true);
    }
});

test('fetchLatestPackageVersion throws when the registry response shape is invalid', async () => {
    await expectError(fakeNpmFetch(fake.resolves({ name: 'pkg-a' })), 'Got an invalid response from registry API');
});

test('fetchLatestPackageVersion throws when the version listed under dist-tags.latest has no entry', async () => {
    await expectError(
        fakeNpmFetch(fake.resolves({ name: 'pkg-a', 'dist-tags': { latest: '1.2.3' }, versions: {} })),
        'Version "1.2.3" for package "pkg-a" has no entry in the registry response'
    );
});

test('fetchPackageTarball returns the buffered tarball contents', async () => {
    const buffer = fake.resolves(Buffer.from('tarball-bytes'));

    const result = await fetchPackageTarball(
        fakeNpmFetch(fake(), buffer),
        'https://example.com/pkg-a-1.2.3.tgz',
        settings
    );

    assert.deepStrictEqual(result, Buffer.from('tarball-bytes'));
});
