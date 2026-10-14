import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake, type SinonSpy } from 'sinon';
import {
    createNpmOpenIdentityConnectIdentifierTokenResolver,
    type NpmOpenIdentityConnectIdentifierTokenResolver
} from './npm-open-identity-connect-identifier-token-resolver.ts';

type Overrides = {
    readonly fetch?: typeof globalThis.fetch;
    readonly environmentVariables?: Readonly<Record<string, string | undefined>>;
};
type FetchCallRecorder = {
    readonly push: (requestArguments: readonly unknown[]) => unknown;
};

const gitHubActionsEnvironmentVariables = {
    ACTIONS_ID_TOKEN_REQUEST_URL: 'https://pipelinesghub.actions.githubusercontent.com/id-token',
    ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'actions-request-token'
} as const;

function createEnvironmentVariableReader(
    environmentVariables: Readonly<Record<string, string | undefined>> = {}
): (variableName: string) => string | undefined {
    return function (variableName) {
        const value = environmentVariables[variableName];
        return value === undefined || value.length === 0 ? undefined : value;
    };
}

function resolverFactory(overrides: Readonly<Overrides> = {}): NpmOpenIdentityConnectIdentifierTokenResolver {
    const {
        fetch: fetchImplementation = fake.resolves(
            Response.json({ value: 'github-id-token' }, { status: 200 })
        ),
        environmentVariables = {}
    } = overrides;

    return createNpmOpenIdentityConnectIdentifierTokenResolver({
        fetch: fetchImplementation,
        getEnvironmentVariable: createEnvironmentVariableReader(environmentVariables)
    });
}

function createGitHubActionsFetch(fetchCalls?: FetchCallRecorder): typeof globalThis.fetch {
    return (async function (...requestArguments: readonly unknown[]) {
        fetchCalls?.push(requestArguments);
        return {
            ok: true,
            status: 200,
            json: fake.resolves({ value: 'github-id-token' })
        };
    }) as unknown as typeof globalThis.fetch;
}

function createGitHubActionsResolver(
    overrides: Readonly<Overrides> = {}
): NpmOpenIdentityConnectIdentifierTokenResolver {
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
    suite('provider selection', function () {
        test('resolver uses the default environment variable when npm oidc provider is omitted', async function () {
            const resolveIdentifierToken = resolverFactory({
                environmentVariables: {
                    GITHUB_ACTIONS: 'false',
                    NPM_ID_TOKEN: 'upstream-id-token'
                }
            });

            const identifierToken = await resolveIdentifierToken({ type: 'npm-open-identity-connect' });

            assert.strictEqual(identifierToken, 'upstream-id-token');
        });

        test('resolver fetches a GitHub Actions id token when requested', async function () {
            const fetchCalls: (readonly unknown[])[] = [];
            const resolveIdentifierToken = createGitHubActionsResolver({
                fetch: createGitHubActionsFetch(fetchCalls)
            });

            const identifierToken = await resolveIdentifierToken({
                type: 'npm-open-identity-connect',
                provider: 'github-actions'
            });

            assert.strictEqual(identifierToken, 'github-id-token');
            assert.deepStrictEqual(fetchCalls, [
                [
                    new URL(
                        'https://pipelinesghub.actions.githubusercontent.com/id-token?audience=npm%3Aregistry.npmjs.org'
                    ),
                    {
                        headers: { Authorization: 'Bearer actions-request-token' }
                    }
                ]
            ]);
        });

        test('resolver auto-detects GitHub Actions when npm oidc provider is omitted', async function () {
            const fetchCalls: (readonly unknown[])[] = [];
            const resolveIdentifierToken = createGitHubActionsResolver({
                fetch: createGitHubActionsFetch(fetchCalls),
                environmentVariables: {
                    GITHUB_ACTIONS: 'true'
                }
            });

            const identifierToken = await resolveIdentifierToken({ type: 'npm-open-identity-connect' });

            assert.strictEqual(identifierToken, 'github-id-token');
            assert.strictEqual(fetchCalls.length, 1);
        });

        test('resolver uses the env provider even when GitHub Actions markers are present', async function () {
            const fetchSpy = fake() as unknown as typeof globalThis.fetch;
            const resolveIdentifierToken = resolverFactory({
                fetch: fetchSpy,
                environmentVariables: {
                    GITHUB_ACTIONS: 'true',
                    NPM_ID_TOKEN: 'upstream-id-token'
                }
            });

            const identifierToken = await resolveIdentifierToken({
                type: 'npm-open-identity-connect',
                provider: 'environment'
            });

            assert.strictEqual(identifierToken, 'upstream-id-token');
            assert.strictEqual((fetchSpy as unknown as SinonSpy).callCount, 0);
        });

        test('resolver falls back to environment id tokens when auto-detection does not match GitHub Actions', async function () {
            const fetchSpy = fake() as unknown as typeof globalThis.fetch;
            const resolveIdentifierToken = resolverFactory({
                fetch: fetchSpy,
                environmentVariables: {
                    GITHUB_ACTIONS: 'false',
                    NPM_ID_TOKEN: 'upstream-id-token'
                }
            });

            const identifierToken = await resolveIdentifierToken({
                type: 'npm-open-identity-connect',
                provider: 'automatic'
            });

            assert.strictEqual(identifierToken, 'upstream-id-token');
            assert.strictEqual((fetchSpy as unknown as SinonSpy).callCount, 0);
        });
    });

    test('resolver rejects GitHub Actions OIDC when required environment variables are missing', async function () {
        const resolveIdentifierToken = resolverFactory();

        await expectFailure(async function () {
            await resolveIdentifierToken({ type: 'npm-open-identity-connect', provider: 'github-actions' });
        }, /^Error: GitHub Actions OIDC requires ACTIONS_ID_TOKEN_REQUEST_URL and ACTIONS_ID_TOKEN_REQUEST_TOKEN$/u);
    });

    suite('GitHub Actions missing environment variables', function () {
        for (
            const [ missingVariable, requestAddress, requestToken ] of [
                [ 'ACTIONS_ID_TOKEN_REQUEST_URL', undefined, 'actions-request-token' ],
                [
                    'ACTIONS_ID_TOKEN_REQUEST_TOKEN',
                    'https://pipelinesghub.actions.githubusercontent.com/id-token',
                    undefined
                ]
            ] as const
        ) {
            test(`resolver rejects GitHub Actions OIDC when ${missingVariable} is missing`, async function () {
                const resolveIdentifierToken = createGitHubActionsResolver({
                    environmentVariables: {
                        ACTIONS_ID_TOKEN_REQUEST_URL: requestAddress,
                        ACTIONS_ID_TOKEN_REQUEST_TOKEN: requestToken
                    }
                });

                await expectFailure(
                    async function () {
                        await resolveIdentifierToken({ type: 'npm-open-identity-connect', provider: 'github-actions' });
                    },
                    /^Error: GitHub Actions OIDC requires ACTIONS_ID_TOKEN_REQUEST_URL and ACTIONS_ID_TOKEN_REQUEST_TOKEN$/u
                );
            });
        }
    });

    suite('GitHub Actions invalid id token responses', function () {
        for (
            const [ testName, response ] of [
                [ 'an unusable', {} ],
                [ 'a non-object', 'invalid-response' ],
                [ 'an array', Object.assign([], { value: 'github-id-token' }) ],
                [ 'an empty', { value: '' } ]
            ] as const
        ) {
            test(`resolver rejects ${testName} GitHub Actions id token response`, async function () {
                const resolveIdentifierToken = createGitHubActionsResolver({
                    fetch: fake.resolves({
                        ok: true,
                        status: 200,
                        json: fake.resolves(response)
                    }) as unknown as typeof globalThis.fetch
                });

                await expectFailure(async function () {
                    await resolveIdentifierToken({ type: 'npm-open-identity-connect', provider: 'github-actions' });
                }, /^Error: GitHub Actions OIDC token response did not contain a usable id_token$/u);
            });
        }
    });

    test('resolver rejects a failing GitHub Actions id token request', async function () {
        const resolveIdentifierToken = createGitHubActionsResolver({
            fetch: fake.resolves({
                ok: false,
                status: 500,
                json: fake.resolves({})
            }) as unknown as typeof globalThis.fetch
        });

        await expectFailure(async function () {
            await resolveIdentifierToken({ type: 'npm-open-identity-connect', provider: 'github-actions' });
        }, /^Error: GitHub Actions OIDC token request failed with status 500$/u);
    });

    test('resolver rejects a missing environment id token for env provider', async function () {
        const resolveIdentifierToken = resolverFactory();

        await expectFailure(async function () {
            await resolveIdentifierToken({
                type: 'npm-open-identity-connect',
                provider: 'environment',
                identityTokenEnvironmentVariable: 'CUSTOM_IDENTIFIER_TOKEN'
            });
        }, /^Error: OIDC id_token environment variable "CUSTOM_IDENTIFIER_TOKEN" is missing$/u);
    });

    test('resolver rejects an empty environment id token for env provider', async function () {
        const resolveIdentifierToken = resolverFactory({
            environmentVariables: { CUSTOM_IDENTIFIER_TOKEN: '' }
        });

        await expectFailure(async function () {
            await resolveIdentifierToken({
                type: 'npm-open-identity-connect',
                provider: 'environment',
                identityTokenEnvironmentVariable: 'CUSTOM_IDENTIFIER_TOKEN'
            });
        }, /^Error: OIDC id_token environment variable "CUSTOM_IDENTIFIER_TOKEN" is missing$/u);
    });

    suite('ACTIONS_ID_TOKEN_REQUEST_URL host validation', function () {
        test('resolver rejects a non-actions.githubusercontent.com host with the full mismatch message', async function () {
            const resolveIdentifierToken = createGitHubActionsResolver({
                environmentVariables: {
                    ACTIONS_ID_TOKEN_REQUEST_URL: 'https://attacker.example/id-token'
                }
            });

            const expectedSuffix =
                'ACTIONS_ID_TOKEN_REQUEST_URL hostname must end with ".actions.githubusercontent.com", ' +
                'got "attacker.example". A non-GitHub host would receive the GitHub-issued OIDC bearer.';
            await expectFailure(
                async function () {
                    await resolveIdentifierToken({ type: 'npm-open-identity-connect', provider: 'github-actions' });
                },
                new RegExp(`^Error: ${expectedSuffix.replaceAll(/[.*+?^${}()|[\]\\]/gu, '\\$&')}$`, 'u')
            );
        });

        test('resolver rejects a lookalike host', async function () {
            const resolveIdentifierToken = createGitHubActionsResolver({
                environmentVariables: {
                    ACTIONS_ID_TOKEN_REQUEST_URL: 'https://actions.githubusercontent.com.attacker.example/id-token'
                }
            });

            await expectFailure(async function () {
                await resolveIdentifierToken({ type: 'npm-open-identity-connect', provider: 'github-actions' });
            }, /hostname must end with "\.actions\.githubusercontent\.com"/u);
        });

        test('resolver rejects an http ACTIONS_ID_TOKEN_REQUEST_URL', async function () {
            const requestAddress = new URL('https://pipelinesghub.actions.githubusercontent.com/id-token');
            requestAddress.protocol = 'http:';
            const resolveIdentifierToken = createGitHubActionsResolver({
                environmentVariables: {
                    ACTIONS_ID_TOKEN_REQUEST_URL: requestAddress.href
                }
            });

            await expectFailure(async function () {
                await resolveIdentifierToken({ type: 'npm-open-identity-connect', provider: 'github-actions' });
            }, /^Error: ACTIONS_ID_TOKEN_REQUEST_URL must use https/u);
        });

        test('resolver rejects a malformed ACTIONS_ID_TOKEN_REQUEST_URL', async function () {
            const resolveIdentifierToken = createGitHubActionsResolver({
                environmentVariables: {
                    ACTIONS_ID_TOKEN_REQUEST_URL: 'not-a-url'
                }
            });

            await expectFailure(async function () {
                await resolveIdentifierToken({ type: 'npm-open-identity-connect', provider: 'github-actions' });
            }, /^Error: ACTIONS_ID_TOKEN_REQUEST_URL is not a valid URL/u);
        });
    });
});
