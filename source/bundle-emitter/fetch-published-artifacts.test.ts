import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake } from 'sinon';
import { Maybe } from 'true-myth';
import { assertDeepSubset } from '../test-libraries/deep-subset-assertion.ts';
import { emptyTarball } from '../test-libraries/tarball-fixtures.ts';
import type { RegistryClient } from './registry/registry-client.ts';
import { fetchPublishedArtifacts } from './fetch-published-artifacts.ts';

const registrySettings = { auth: { type: 'bearer-token', token: 'the-token' } } as const;

type RegistryClientOverrides = {
    readonly fetchLatestReleaseMetadata?: RegistryClient['fetchLatestReleaseMetadata'];
    readonly fetchTarball?: RegistryClient['fetchTarball'];
};

function registryClientWith(overrides: RegistryClientOverrides): RegistryClient {
    return {
        fetchLatestReleaseMetadata: overrides.fetchLatestReleaseMetadata ?? fake(),
        fetchLatestVersion: fake(),
        fetchStagedVersions: fake(),
        fetchTarball: overrides.fetchTarball ?? fake(),
        publishPackage: fake()
    };
}

function assertFetchedArtifacts(result: Awaited<ReturnType<typeof fetchPublishedArtifacts>>): void {
    if (result.isNothing) {
        assert.fail('expected fetched artifacts');
    }
    assertDeepSubset(result, {
        value: {
            version: '1.2.3',
            publishedAt: new Date('2026-05-20T00:00:00.000Z'),
            gitHead: 'abcdef123456',
            files: []
        }
    });
}

suite('fetch-published-artifacts', function () {
    test('returns Nothing when the registry has no latest version', async function () {
        const fetchLatestReleaseMetadata = fake.resolves(Maybe.nothing());
        const fetchTarball = fake();
        const client = registryClientWith({ fetchLatestReleaseMetadata, fetchTarball });

        const result = await fetchPublishedArtifacts(client, 'the-name', registrySettings);

        assert.strictEqual(result.isNothing, true);
        assertDeepSubset(fetchLatestReleaseMetadata, {
            callCount: 1,
            firstCall: {
                args: [ 'the-name', registrySettings ]
            }
        });
        assert.strictEqual(fetchTarball.callCount, 0);
    });

    test('returns Just with the version, publish time, and extracted files when the registry has a latest version', async function () {
        const fetchLatestReleaseMetadata = fake.resolves(
            Maybe.just({
                version: '1.2.3',
                tarballUrl: 'https://registry.example.test/package.tgz',
                publishedAt: new Date('2026-05-20T00:00:00.000Z'),
                gitHead: 'abcdef123456'
            })
        );
        const fetchTarball = fake.resolves(emptyTarball);
        const client = registryClientWith({ fetchLatestReleaseMetadata, fetchTarball });

        const result = await fetchPublishedArtifacts(client, 'the-name', registrySettings);

        assertFetchedArtifacts(result);
        assert.deepStrictEqual(fetchTarball.firstCall.args, [
            'https://registry.example.test/package.tgz',
            registrySettings
        ]);
    });
});
