import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake, type SinonSpy } from 'sinon';
import { createNpmOidcIdTokenResolver } from './npm-oidc-id-token-resolver.ts';

type Overrides = {
    readonly fetch?: typeof globalThis.fetch;
    readonly environmentVariables?: Readonly<Record<string, string | undefined>>;
};

const gitHubActionsEnvironmentVariables = {
    ACTIONS_ID_TOKEN_REQUEST_URL: 'https://actions.example.test/id-token',
    ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'actions-request-token'
} as const;

function createEnvironmentVariableReader(
    environmentVariables: Readonly<Record<string, string | undefined>> = {}
): (variableName: string) => string | undefined {
    return (variableName) => {
        const value = environmentVariables[variableName];
        return value === undefined || value.length === 0 ? undefined : value;
    };
}

function resolverFactory(overrides: Readonly<Overrides> = {}) {
    const {
        fetch: fetchImplementation = fake.resolves({
            ok: true,
            status: 200,
            json: fake.resolves({ value: 'github-id-token' })
        }) as unknown as typeof globalThis.fetch,
        environmentVariables = {}
    } = overrides;

    return createNpmOidcIdTokenResolver({
        fetch: fetchImplementation,
        getEnvironmentVariable: createEnvironmentVariableReader(environmentVariables)
    });
}

function createGitHubActionsFetch(fetchCalls?: unknown[][]): typeof globalThis.fetch {
    return (async (...args: unknown[]) => {
        fetchCalls?.push(args);
        return {
            ok: true,
            status: 200,
            json: fake.resolves({ value: 'github-id-token' })
        };
    }) as unknown as typeof globalThis.fetch;
}

function createGitHubActionsResolver(overrides: Readonly<Overrides> = {}) {
    return resolverFactory({
        ...overrides,
        environmentVariables: {
            ...gitHubActionsEnvironmentVariables,
            ...overrides.environmentVariables
        }
    });
}

async function expectFailure(action: () => Promise<unknown>, expectedError: RegExp): Promise<void> {
    try {
        await action();
        assert.fail('Expected the action to throw an error');
    } catch (error: unknown) {
        assert.match(String(error), expectedError);
    }
}

suite('npm-oidc-id-token-resolver', function () {
    test('resolver uses the default environment variable when npm oidc provider is omitted', async function () {
        const resolveIdToken = resolverFactory({
            environmentVariables: {
                GITHUB_ACTIONS: 'false',
                NPM_ID_TOKEN: 'upstream-id-token'
            }
        });

        const idToken = await resolveIdToken({ type: 'npm-oidc' });

        assert.strictEqual(idToken, 'upstream-id-token');
    });

    test('resolver fetches a GitHub Actions id token when requested', async function () {
        const fetchCalls: unknown[][] = [];
        const resolveIdToken = createGitHubActionsResolver({
            fetch: createGitHubActionsFetch(fetchCalls)
        });

        const idToken = await resolveIdToken({ type: 'npm-oidc', provider: 'github-actions' });

        assert.strictEqual(idToken, 'github-id-token');
        assert.deepStrictEqual(fetchCalls, [
            [
                new URL('https://actions.example.test/id-token?audience=npm%3Aregistry.npmjs.org'),
                {
                    headers: { Authorization: 'Bearer actions-request-token' }
                }
            ]
        ]);
    });

    test('resolver auto-detects GitHub Actions when npm oidc provider is omitted', async function () {
        const fetchCalls: unknown[][] = [];
        const resolveIdToken = createGitHubActionsResolver({
            fetch: createGitHubActionsFetch(fetchCalls),
            environmentVariables: {
                GITHUB_ACTIONS: 'true'
            }
        });

        const idToken = await resolveIdToken({ type: 'npm-oidc' });

        assert.strictEqual(idToken, 'github-id-token');
        assert.strictEqual(fetchCalls.length, 1);
    });

    test('resolver uses the env provider even when GitHub Actions markers are present', async function () {
        const fetchSpy = fake() as unknown as typeof globalThis.fetch;
        const resolveIdToken = resolverFactory({
            fetch: fetchSpy,
            environmentVariables: {
                GITHUB_ACTIONS: 'true',
                NPM_ID_TOKEN: 'upstream-id-token'
            }
        });

        const idToken = await resolveIdToken({ type: 'npm-oidc', provider: 'env' });

        assert.strictEqual(idToken, 'upstream-id-token');
        assert.strictEqual((fetchSpy as unknown as SinonSpy).callCount, 0);
    });

    test('resolver falls back to environment id tokens when auto-detection does not match GitHub Actions', async function () {
        const fetchSpy = fake() as unknown as typeof globalThis.fetch;
        const resolveIdToken = resolverFactory({
            fetch: fetchSpy,
            environmentVariables: {
                GITHUB_ACTIONS: 'false',
                NPM_ID_TOKEN: 'upstream-id-token'
            }
        });

        const idToken = await resolveIdToken({ type: 'npm-oidc', provider: 'auto' });

        assert.strictEqual(idToken, 'upstream-id-token');
        assert.strictEqual((fetchSpy as unknown as SinonSpy).callCount, 0);
    });

    test('resolver rejects GitHub Actions OIDC when required environment variables are missing', async function () {
        const resolveIdToken = resolverFactory();

        await expectFailure(async () => {
            await resolveIdToken({ type: 'npm-oidc', provider: 'github-actions' });
        }, /^Error: GitHub Actions OIDC requires ACTIONS_ID_TOKEN_REQUEST_URL and ACTIONS_ID_TOKEN_REQUEST_TOKEN$/u);
    });

    suite('GitHub Actions missing environment variables', function () {
        for (const [missingVariable, requestUrl, requestToken] of [
            ['ACTIONS_ID_TOKEN_REQUEST_URL', undefined, 'actions-request-token'],
            ['ACTIONS_ID_TOKEN_REQUEST_TOKEN', 'https://actions.example.test/id-token', undefined]
        ] as const) {
            test(`resolver rejects GitHub Actions OIDC when ${missingVariable} is missing`, async function () {
                const resolveIdToken = createGitHubActionsResolver({
                    environmentVariables: {
                        ACTIONS_ID_TOKEN_REQUEST_URL: requestUrl,
                        ACTIONS_ID_TOKEN_REQUEST_TOKEN: requestToken
                    }
                });

                await expectFailure(async () => {
                    await resolveIdToken({ type: 'npm-oidc', provider: 'github-actions' });
                }, /^Error: GitHub Actions OIDC requires ACTIONS_ID_TOKEN_REQUEST_URL and ACTIONS_ID_TOKEN_REQUEST_TOKEN$/u);
            });
        }
    });

    suite('GitHub Actions invalid id token responses', function () {
        for (const [testName, response] of [
            ['an unusable', {}],
            ['a non-object', 'invalid-response'],
            ['an array', Object.assign([], { value: 'github-id-token' })],
            ['an empty', { value: '' }]
        ] as const) {
            test(`resolver rejects ${testName} GitHub Actions id token response`, async function () {
                const resolveIdToken = createGitHubActionsResolver({
                    fetch: fake.resolves({
                        ok: true,
                        status: 200,
                        json: fake.resolves(response)
                    }) as unknown as typeof globalThis.fetch
                });

                await expectFailure(async () => {
                    await resolveIdToken({ type: 'npm-oidc', provider: 'github-actions' });
                }, /^Error: GitHub Actions OIDC token response did not contain a usable id_token$/u);
            });
        }
    });

    test('resolver rejects a failing GitHub Actions id token request', async function () {
        const resolveIdToken = createGitHubActionsResolver({
            fetch: fake.resolves({
                ok: false,
                status: 500,
                json: fake.resolves({})
            }) as unknown as typeof globalThis.fetch
        });

        await expectFailure(async () => {
            await resolveIdToken({ type: 'npm-oidc', provider: 'github-actions' });
        }, /^Error: GitHub Actions OIDC token request failed with status 500$/u);
    });

    test('resolver rejects a missing environment id token for env provider', async function () {
        const resolveIdToken = resolverFactory();

        await expectFailure(async () => {
            await resolveIdToken({ type: 'npm-oidc', provider: 'env', idTokenEnvVar: 'CUSTOM_ID_TOKEN' });
        }, /^Error: OIDC id_token environment variable "CUSTOM_ID_TOKEN" is missing$/u);
    });

    test('resolver rejects an empty environment id token for env provider', async function () {
        const resolveIdToken = resolverFactory({
            environmentVariables: { CUSTOM_ID_TOKEN: '' }
        });

        await expectFailure(async () => {
            await resolveIdToken({ type: 'npm-oidc', provider: 'env', idTokenEnvVar: 'CUSTOM_ID_TOKEN' });
        }, /^Error: OIDC id_token environment variable "CUSTOM_ID_TOKEN" is missing$/u);
    });
});
