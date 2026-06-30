import assert from 'node:assert';
import { suite, test } from 'mocha';
import { buildLatestVersionFetchJson, registryClientFactory } from './registry-client-test-support.ts';

suite('registry-client metadata auth', function () {
    test('fetchLatestVersion() uses shorthand auth for metadata by default', async function () {
        const npmFetchJson = buildLatestVersionFetchJson();
        const registryClient = registryClientFactory({ npmFetchJson });

        await registryClient.fetchLatestVersion('the-name', {
            auth: { type: 'bearer-token', token: 'the-token' }
        });

        assert.deepStrictEqual(npmFetchJson.firstCall.args, [
            '/the-name',
            {
                alwaysAuth: true,
                registry: undefined,
                forceAuth: { token: 'the-token' },
                headers: { accept: 'application/vnd.npm.install-v1+json' }
            }
        ]);
    });

    test('fetchLatestVersion() uses explicit metadata auth when configured', async function () {
        const npmFetchJson = buildLatestVersionFetchJson();
        const registryClient = registryClientFactory({ npmFetchJson });

        await registryClient.fetchLatestVersion('the-name', {
            auth: {
                publish: { type: 'bearer-token', token: 'writer-token' },
                metadata: { type: 'basic', username: 'reader', password: 'reader-secret' }
            }
        });

        assert.deepStrictEqual(npmFetchJson.firstCall.args, [
            '/the-name',
            {
                alwaysAuth: true,
                registry: undefined,
                forceAuth: {
                    _auth: Buffer.from('reader:reader-secret', 'utf8').toString('base64')
                },
                headers: { accept: 'application/vnd.npm.install-v1+json' }
            }
        ]);
    });

    test('fetchLatestVersion() uses explicit bearer metadata auth when configured', async function () {
        const npmFetchJson = buildLatestVersionFetchJson();
        const registryClient = registryClientFactory({ npmFetchJson });

        await registryClient.fetchLatestVersion('the-name', {
            auth: {
                publish: { type: 'basic', username: 'writer', password: 'writer-secret' },
                metadata: { type: 'bearer-token', token: 'reader-token' }
            }
        });

        assert.deepStrictEqual(npmFetchJson.firstCall.args, [
            '/the-name',
            {
                alwaysAuth: true,
                registry: undefined,
                forceAuth: { token: 'reader-token' },
                headers: { accept: 'application/vnd.npm.install-v1+json' }
            }
        ]);
    });

    test('fetchLatestVersion() inherits publish auth for metadata by default when expanded auth omits metadata', async function () {
        const npmFetchJson = buildLatestVersionFetchJson();
        const registryClient = registryClientFactory({ npmFetchJson });

        await registryClient.fetchLatestVersion('the-name', {
            auth: {
                publish: { type: 'bearer-token', token: 'writer-token' }
            }
        });

        assert.deepStrictEqual(npmFetchJson.firstCall.args, [
            '/the-name',
            {
                alwaysAuth: true,
                registry: undefined,
                forceAuth: { token: 'writer-token' },
                headers: { accept: 'application/vnd.npm.install-v1+json' }
            }
        ]);
    });

    test('fetchLatestReleaseMetadata() uses the full metadata endpoint with inherited metadata auth', async function () {
        const npmFetchJson = buildLatestVersionFetchJson();
        const registryClient = registryClientFactory({ npmFetchJson });

        await registryClient.fetchLatestReleaseMetadata('the-name', {
            auth: { type: 'bearer-token', token: 'the-token' }
        });

        assert.deepStrictEqual(npmFetchJson.firstCall.args, [
            '/the-name',
            {
                alwaysAuth: true,
                registry: undefined,
                forceAuth: { token: 'the-token' },
                headers: undefined
            }
        ]);
    });

    test('fetchLatestVersion() uses anonymous metadata access by default for explicit npm oidc auth', async function () {
        const npmFetchJson = buildLatestVersionFetchJson();
        const registryClient = registryClientFactory({ npmFetchJson });

        await registryClient.fetchLatestVersion('the-name', {
            auth: {
                publish: { type: 'npm-oidc' }
            }
        });

        assert.deepStrictEqual(npmFetchJson.firstCall.args, [
            '/the-name',
            {
                alwaysAuth: true,
                registry: undefined,
                headers: { accept: 'application/vnd.npm.install-v1+json' }
            }
        ]);
    });

    test('fetchLatestVersion() uses shorthand npm oidc auth without attaching metadata credentials', async function () {
        const npmFetchJson = buildLatestVersionFetchJson();
        const registryClient = registryClientFactory({ npmFetchJson });

        await registryClient.fetchLatestVersion('the-name', {
            auth: { type: 'npm-oidc', provider: 'env' }
        });

        assert.deepStrictEqual(npmFetchJson.firstCall.args, [
            '/the-name',
            {
                alwaysAuth: true,
                registry: undefined,
                headers: { accept: 'application/vnd.npm.install-v1+json' }
            }
        ]);
    });

    test('fetchLatestVersion() uses anonymous metadata access by default for shorthand npm oidc auth', async function () {
        const npmFetchJson = buildLatestVersionFetchJson();
        const registryClient = registryClientFactory({ npmFetchJson });

        await registryClient.fetchLatestVersion('the-name', {
            auth: { type: 'npm-oidc' }
        });

        assert.deepStrictEqual(npmFetchJson.firstCall.args, [
            '/the-name',
            {
                alwaysAuth: true,
                registry: undefined,
                headers: { accept: 'application/vnd.npm.install-v1+json' }
            }
        ]);
    });

    test('fetchLatestVersion() uses anonymous metadata access when explicitly configured', async function () {
        const npmFetchJson = buildLatestVersionFetchJson();
        const registryClient = registryClientFactory({ npmFetchJson });

        await registryClient.fetchLatestVersion('the-name', {
            auth: {
                publish: { type: 'bearer-token', token: 'writer-token' },
                metadata: 'anonymous'
            }
        });

        assert.deepStrictEqual(npmFetchJson.firstCall.args, [
            '/the-name',
            {
                alwaysAuth: true,
                registry: undefined,
                headers: { accept: 'application/vnd.npm.install-v1+json' }
            }
        ]);
    });

    test('fetchLatestVersion() escapes scoped package names', async function () {
        const npmFetchJson = buildLatestVersionFetchJson();
        const registryClient = registryClientFactory({ npmFetchJson });

        await registryClient.fetchLatestVersion('@the/name', {
            auth: { type: 'bearer-token', token: 'the-token' }
        });

        assert.strictEqual(npmFetchJson.firstCall.firstArg, '/@the%2Fname');
    });
});
