import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake } from 'sinon';
import { createWebLogin, type WebLogin, type WebLoginDependencies } from './web-login.ts';

type LoginWebFunction = WebLoginDependencies['loginWeb'];
type OpenInBrowser = WebLoginDependencies['openInBrowser'];
type WebLoginResult = Awaited<ReturnType<WebLogin['login']>>;

function createSuccessfulLoginWeb(token: WebLoginResult): LoginWebFunction {
    return async function () {
        return token;
    };
}

suite('web-login', function () {
    test('forwards the registry URL, hostname and the web auth-type marker to loginWeb', async function () {
        const recordedOptions: { readonly registry: string; readonly hostname: string; readonly authType: 'web'; }[] =
            [];
        const loginWeb: LoginWebFunction = async function (_opener, options) {
            recordedOptions.push({
                registry: options.registry,
                hostname: options.hostname,
                authType: options.authType
            });
            return { token: 'tk', username: 'alice' };
        };
        const openInBrowser: OpenInBrowser = fake.resolves(undefined);
        const webLogin = createWebLogin({ loginWeb, openInBrowser });

        await webLogin.login({ registryUrl: 'https://registry.npmjs.org/', hostname: 'workstation' });

        assert.deepStrictEqual(recordedOptions, [
            { registry: 'https://registry.npmjs.org/', hostname: 'workstation', authType: 'web' }
        ]);
    });

    test('passes the supplied openInBrowser callback to loginWeb as the opener', async function () {
        const openInBrowser: OpenInBrowser = fake.resolves(undefined);
        const recordedOpeners: OpenInBrowser[] = [];
        const loginWeb: LoginWebFunction = async function (opener) {
            recordedOpeners.push(opener);
            return { token: 'tk', username: 'alice' };
        };
        const webLogin = createWebLogin({ loginWeb, openInBrowser });

        await webLogin.login({ registryUrl: 'https://registry.npmjs.org/', hostname: 'workstation' });

        assert.strictEqual(recordedOpeners.length, 1);
        assert.strictEqual(recordedOpeners[0], openInBrowser);
    });

    test('returns the token and username produced by loginWeb', async function () {
        const expected: WebLoginResult = { token: 'session-token', username: 'alice' };
        const webLogin = createWebLogin({
            loginWeb: createSuccessfulLoginWeb(expected),
            openInBrowser: fake.resolves(undefined)
        });

        const result = await webLogin.login({
            registryUrl: 'https://registry.npmjs.org/',
            hostname: 'workstation'
        });

        assert.deepStrictEqual(result, expected);
    });

    test('propagates errors thrown by loginWeb', async function () {
        const loginWeb: LoginWebFunction = async function () {
            throw new Error('npm login web flow timed out');
        };
        const webLogin = createWebLogin({ loginWeb, openInBrowser: fake.resolves(undefined) });

        try {
            await webLogin.login({ registryUrl: 'https://registry.npmjs.org/', hostname: 'workstation' });
            assert.fail('expected login to throw');
        } catch (error: unknown) {
            assert.ok(error instanceof Error);
            assert.strictEqual(error.message, 'npm login web flow timed out');
        }
    });
});
