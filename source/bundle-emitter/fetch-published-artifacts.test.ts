import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake } from 'sinon';
import { Maybe } from 'true-myth';
import type { RegistryClient } from './registry/registry-client.ts';
import { fetchPublishedArtifacts } from './fetch-published-artifacts.ts';

const registrySettings = { auth: { type: 'bearer-token', token: 'the-token' } } as const;

const emptyTarball = Buffer.from([
    31, 139, 8, 0, 0, 0, 0, 0, 2, 255, 99, 96, 24, 5, 163, 96, 20, 140, 84, 0, 0, 46, 175, 181, 239, 0, 4, 0, 0
]);

function registryClientWith(overrides: {
    readonly fetchLatestVersion?: RegistryClient['fetchLatestVersion'];
    readonly fetchTarball?: RegistryClient['fetchTarball'];
}): RegistryClient {
    return {
        fetchLatestVersion: overrides.fetchLatestVersion ?? fake(),
        fetchTarball: overrides.fetchTarball ?? fake(),
        publishPackage: fake()
    };
}

suite('fetch-published-artifacts', function () {
    test('returns Nothing when the registry has no latest version', async function () {
        const fetchLatestVersion = fake.resolves(Maybe.nothing());
        const fetchTarball = fake();
        const client = registryClientWith({ fetchLatestVersion, fetchTarball });

        const result = await fetchPublishedArtifacts(client, 'the-name', registrySettings);

        assert.strictEqual(result.isNothing, true);
        assert.strictEqual(fetchLatestVersion.callCount, 1);
        assert.deepStrictEqual(fetchLatestVersion.firstCall.args, ['the-name', registrySettings]);
        assert.strictEqual(fetchTarball.callCount, 0);
    });

    test('returns Just with the version and extracted files when the registry has a latest version', async function () {
        const fetchLatestVersion = fake.resolves(
            Maybe.just({ version: '1.2.3', tarballUrl: 'https://registry.example.test/package.tgz' })
        );
        const fetchTarball = fake.resolves(emptyTarball);
        const client = registryClientWith({ fetchLatestVersion, fetchTarball });

        const result = await fetchPublishedArtifacts(client, 'the-name', registrySettings);

        if (result.isNothing) {
            assert.fail('expected fetched artifacts');
        }
        assert.strictEqual(result.value.version, '1.2.3');
        assert.deepStrictEqual(result.value.files, []);
        assert.deepStrictEqual(fetchTarball.firstCall.args, [
            'https://registry.example.test/package.tgz',
            registrySettings
        ]);
    });
});
