import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake, type SinonSpy } from 'sinon';
import type _npmFetch from 'npm-registry-fetch';
import type { RegistrySettings } from '../../config/registry-settings.ts';
import {
    fetchLatestPackageReleaseMetadata,
    fetchLatestPackageVersion,
    fetchPackageTarball,
    fetchStagedPackageVersions
} from './package-metadata-fetcher.ts';

type FakeNpmFetch = SinonSpy & { json: SinonSpy };

const settings: RegistrySettings = { auth: { type: 'bearer-token', token: 'tok' } };
const latestVersion = '1.2.3';
const tarballUrl = 'https://registry.npmjs.org/pkg-a/-/pkg-a-1.2.3.tgz';

function fakeNpmFetch(json: SinonSpy, buffer: SinonSpy = fake.resolves(Buffer.from([]))): typeof _npmFetch {
    const npmFetch: FakeNpmFetch = fake.resolves({ buffer }) as FakeNpmFetch;
    npmFetch.json = json;
    return npmFetch as unknown as typeof _npmFetch;
}

function latestPackageResponse(time?: string): Record<string, unknown> {
    return {
        name: 'pkg-a',
        'dist-tags': { latest: latestVersion },
        ...(time === undefined ? {} : { time: { [latestVersion]: time } }),
        versions: { [latestVersion]: { dist: { tarball: tarballUrl } } }
    };
}

function fakeJsonSequence(...responses: readonly (Error | Record<string, unknown>)[]): SinonSpy {
    let callIndex = 0;

    return fake(async () => {
        const response = responses[callIndex];
        callIndex += 1;
        if (response === undefined) {
            throw new Error('Unexpected extra stage lookup');
        }
        if (response instanceof Error) {
            throw response;
        }
        return response;
    });
}

async function expectError(npmFetch: typeof _npmFetch, expectedMessage: string): Promise<void> {
    try {
        await fetchLatestPackageVersion(npmFetch, 'pkg-a', settings);
        assert.fail('Expected fetchLatestPackageVersion() to throw but it did not');
    } catch (error: unknown) {
        assert.strictEqual((error as Error).message, expectedMessage);
    }
}

suite('package-metadata-fetcher', function () {
    test('fetchLatestPackageVersion returns the latest version details when the registry response is valid', async function () {
        const result = await fetchLatestPackageVersion(
            fakeNpmFetch(
                fake.resolves({
                    name: 'pkg-a',
                    'dist-tags': { latest: latestVersion },
                    versions: { [latestVersion]: { dist: { tarball: tarballUrl } } }
                })
            ),
            'pkg-a',
            settings
        );

        assert.deepStrictEqual(result.unwrapOr({ version: '', tarballUrl: '', gitHead: undefined }), {
            version: latestVersion,
            tarballUrl,
            gitHead: undefined
        });
    });

    test('fetchLatestPackageVersion returns Nothing when the registry has no latest dist-tag', async function () {
        const result = await fetchLatestPackageVersion(
            fakeNpmFetch(fake.resolves({ name: 'pkg-a', 'dist-tags': {}, versions: {} })),
            'pkg-a',
            settings
        );

        assert.strictEqual(result.isNothing, true);
    });

    test('fetchLatestPackageVersion returns Nothing when the registry responds with a missing-package status', async function () {
        for (const statusCode of [404, 403] as const) {
            const result = await fetchLatestPackageVersion(
                fakeNpmFetch(fake.rejects(Object.assign(new Error(`status ${statusCode}`), { statusCode }))),
                'pkg-a',
                settings
            );
            assert.strictEqual(result.isNothing, true);
        }
    });

    test('fetchLatestPackageVersion throws when the registry response shape is invalid', async function () {
        await expectError(fakeNpmFetch(fake.resolves({ name: 'pkg-a' })), 'Got an invalid response from registry API');
    });

    test('fetchLatestPackageVersion throws when the version listed under dist-tags.latest has no entry', async function () {
        await expectError(
            fakeNpmFetch(fake.resolves({ name: 'pkg-a', 'dist-tags': { latest: '1.2.3' }, versions: {} })),
            'Version "1.2.3" for package "pkg-a" has no entry in the registry response'
        );
    });

    test('fetchLatestPackageReleaseMetadata returns the latest version details with publishedAt when the registry response is valid', async function () {
        const result = await fetchLatestPackageReleaseMetadata(
            fakeNpmFetch(fake.resolves(latestPackageResponse('2026-05-19T10:00:00.000Z'))),
            'pkg-a',
            settings
        );

        assert.deepStrictEqual(
            result.unwrapOr({
                version: '',
                tarballUrl: '',
                publishedAt: undefined,
                gitHead: undefined
            }),
            {
                version: latestVersion,
                tarballUrl,
                publishedAt: new Date('2026-05-19T10:00:00.000Z'),
                gitHead: undefined
            }
        );
    });

    test('fetchLatestPackageReleaseMetadata returns gitHead from the latest version entry', async function () {
        const result = await fetchLatestPackageReleaseMetadata(
            fakeNpmFetch(
                fake.resolves({
                    name: 'pkg-a',
                    'dist-tags': { latest: latestVersion },
                    versions: { [latestVersion]: { dist: { tarball: tarballUrl }, gitHead: 'abcdef123456' } }
                })
            ),
            'pkg-a',
            settings
        );

        const fallback = { version: '', tarballUrl: '', publishedAt: undefined, gitHead: undefined };
        assert.strictEqual(result.unwrapOr(fallback).gitHead, 'abcdef123456');
    });

    test('fetchLatestPackageReleaseMetadata returns undefined publishedAt when the registry omits the time entry', async function () {
        const result = await fetchLatestPackageReleaseMetadata(
            fakeNpmFetch(fake.resolves(latestPackageResponse())),
            'pkg-a',
            settings
        );

        assert.deepStrictEqual(
            result.unwrapOr({
                version: '',
                tarballUrl: '',
                publishedAt: undefined,
                gitHead: undefined
            }),
            {
                version: latestVersion,
                tarballUrl,
                publishedAt: undefined,
                gitHead: undefined
            }
        );
    });

    test('fetchLatestPackageReleaseMetadata returns Nothing when the package is missing from the registry', async function () {
        const result = await fetchLatestPackageReleaseMetadata(
            fakeNpmFetch(fake.rejects(Object.assign(new Error('status 404'), { statusCode: 404 }))),
            'pkg-a',
            settings
        );

        assert.strictEqual(result.isNothing, true);
    });

    test('fetchLatestPackageReleaseMetadata returns Nothing when the full metadata has no latest dist-tag', async function () {
        const result = await fetchLatestPackageReleaseMetadata(
            fakeNpmFetch(fake.resolves({ name: 'pkg-a', 'dist-tags': {}, versions: {} })),
            'pkg-a',
            settings
        );

        assert.strictEqual(result.isNothing, true);
    });

    test('fetchLatestPackageReleaseMetadata throws when the publish time is invalid', async function () {
        try {
            await fetchLatestPackageReleaseMetadata(
                fakeNpmFetch(fake.resolves(latestPackageResponse('not-a-date'))),
                'pkg-a',
                settings
            );
            assert.fail('Expected fetchLatestPackageReleaseMetadata() to throw but it did not');
        } catch (error: unknown) {
            assert.strictEqual((error as Error).message, 'Version publish time "not-a-date" is not a valid timestamp');
        }
    });

    test('fetchStagedPackageVersions returns staged versions across pages and stops when it reaches the total', async function () {
        const json = fakeJsonSequence(
            { items: [{ version: '1.2.4' }], total: 2 },
            { items: [{ version: '1.2.5' }], total: 2 },
            new Error('Unexpected extra stage lookup')
        );

        const result = await fetchStagedPackageVersions(fakeNpmFetch(json), 'pkg-a', settings);

        assert.deepStrictEqual(result, ['1.2.4', '1.2.5']);
        assert.strictEqual(json.callCount, 2);
    });

    test('fetchStagedPackageVersions stops when a later page is empty even if the total is larger', async function () {
        const json = fakeJsonSequence(
            { items: [{ version: '1.2.4' }], total: 3 },
            { items: [], total: 3 },
            new Error('Unexpected extra stage lookup')
        );

        const result = await fetchStagedPackageVersions(fakeNpmFetch(json), 'pkg-a', settings);

        assert.deepStrictEqual(result, ['1.2.4']);
        assert.strictEqual(json.callCount, 2);
    });

    test('fetchStagedPackageVersions returns an empty list when the first page is empty', async function () {
        const json = fakeJsonSequence({ items: [], total: 0 }, new Error('Unexpected extra stage lookup'));

        const result = await fetchStagedPackageVersions(fakeNpmFetch(json), 'pkg-a', settings);

        assert.deepStrictEqual(result, []);
        assert.strictEqual(json.callCount, 1);
    });

    test('fetchPackageTarball returns the buffered tarball contents', async function () {
        const buffer = fake.resolves(Buffer.from('tarball-bytes'));

        const result = await fetchPackageTarball(fakeNpmFetch(fake(), buffer), tarballUrl, settings);

        assert.deepStrictEqual(result, Buffer.from('tarball-bytes'));
    });

    test('fetchPackageTarball rejects a tarball URL whose origin differs from the configured registry', async function () {
        const buffer = fake.resolves(Buffer.from('tarball-bytes'));
        const expectedMessage =
            'Refusing to download tarball from "https://attacker.example" because it differs from the configured ' +
            'registry origin "https://registry.npmjs.org". A tampered registry response could redirect the request and ' +
            'exfiltrate publish credentials.';

        try {
            await fetchPackageTarball(
                fakeNpmFetch(fake(), buffer),
                'https://attacker.example/pkg-a-1.2.3.tgz',
                settings
            );
            assert.fail('Expected fetchPackageTarball() to throw but it did not');
        } catch (error: unknown) {
            assert.strictEqual((error as Error).message, expectedMessage);
        }
        assert.strictEqual(buffer.callCount, 0);
    });

    test('fetchPackageTarball accepts a tarball URL whose origin matches a custom configured registry', async function () {
        const customSettings: RegistrySettings = {
            registryUrl: 'https://registry.example.test/',
            auth: { type: 'bearer-token', token: 'tok' }
        };
        const buffer = fake.resolves(Buffer.from('tarball-bytes'));

        const result = await fetchPackageTarball(
            fakeNpmFetch(fake(), buffer),
            'https://registry.example.test/pkg-a/-/pkg-a-1.2.3.tgz',
            customSettings
        );

        assert.deepStrictEqual(result, Buffer.from('tarball-bytes'));
    });

    test('fetchPackageTarball rejects a malformed tarball URL', async function () {
        const buffer = fake.resolves(Buffer.from('tarball-bytes'));

        try {
            await fetchPackageTarball(fakeNpmFetch(fake(), buffer), 'not-a-url', settings);
            assert.fail('Expected fetchPackageTarball() to throw but it did not');
        } catch (error: unknown) {
            assert.strictEqual((error as Error).message, 'Registry returned an invalid tarball URL: "not-a-url"');
        }
        assert.strictEqual(buffer.callCount, 0);
    });
});
