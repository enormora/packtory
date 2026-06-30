import assert from 'node:assert';
import { suite, test } from 'mocha';
import { buildLatestVersionFetchJson, registryClientFactory } from './registry-client-test-support.ts';

suite('registry-client metadata inheritance', function () {
    test('fetchLatestVersion() inherits publish auth for metadata when explicit metadata mode requests it', async function () {
        const npmFetchJson = buildLatestVersionFetchJson();
        const registryClient = registryClientFactory({ npmFetchJson });

        await registryClient.fetchLatestVersion('the-name', {
            auth: {
                publish: { type: 'basic', username: 'reader', password: 'reader-secret', email: 'reader@example.test' },
                metadata: 'inherit-publish-auth'
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
                email: 'reader@example.test',
                headers: { accept: 'application/vnd.npm.install-v1+json' }
            }
        ]);
    });

    test('fetchLatestVersion() treats inherit-publish-auth as anonymous when publish auth uses npm oidc', async function () {
        const npmFetchJson = buildLatestVersionFetchJson();
        const registryClient = registryClientFactory({ npmFetchJson });

        await registryClient.fetchLatestVersion('the-name', {
            auth: {
                publish: { type: 'npm-oidc', provider: 'env' },
                metadata: 'inherit-publish-auth'
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
});
