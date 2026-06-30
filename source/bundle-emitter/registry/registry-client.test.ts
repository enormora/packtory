import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake } from 'sinon';
import { registryClientFactory } from './registry-client-test-support.ts';

suite('registry-client publish auth', function () {
    test('publishPackage() uses shorthand bearer auth and one-time-password prompt when provided', async function () {
        const publish = fake.resolves(undefined);
        const promptForOneTimePassword = fake.resolves('123456');
        const registryClient = registryClientFactory({ publish, promptForOneTimePassword });
        const tarData = Buffer.from([ 1, 2, 3, 4 ]);

        await registryClient.publishPackage(
            { name: 'the-name', version: 'the-version' },
            tarData,
            {
                auth: { type: 'bearer-token', token: 'the-token' }
            },
            { access: 'public' },
            false
        );

        assert.deepStrictEqual(publish.firstCall.args, [
            { name: 'the-name', version: 'the-version' },
            tarData,
            {
                defaultTag: 'latest',
                alwaysAuth: true,
                registry: undefined,
                access: 'public',
                forceAuth: { token: 'the-token' },
                otpPrompt: promptForOneTimePassword
            }
        ]);
    });

    test('publishPackage() uses explicit basic auth when configured', async function () {
        const publish = fake.resolves(undefined);
        const registryClient = registryClientFactory({ publish });

        await registryClient.publishPackage(
            { name: 'the-name', version: 'the-version' },
            Buffer.from([]),
            {
                registryUrl: 'https://registry.example.test',
                auth: {
                    type: 'basic',
                    username: 'user',
                    password: 'secret'
                }
            },
            { access: 'public' },
            false
        );

        assert.deepStrictEqual(publish.firstCall.args.at(-1), {
            defaultTag: 'latest',
            alwaysAuth: true,
            registry: 'https://registry.example.test',
            access: 'public',
            forceAuth: {
                _auth: Buffer.from('user:secret', 'utf8').toString('base64')
            }
        });
    });
});
