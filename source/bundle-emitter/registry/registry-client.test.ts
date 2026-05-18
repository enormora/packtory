import assert from 'node:assert';
import { test } from 'mocha';
import { fake, type SinonSpy } from 'sinon';
import { Maybe } from 'true-myth';
import type { PublishAuthStrategy } from '../../config/registry-settings.ts';
import { createFakeClock, type FakeClock } from '../../test-libraries/fake-clock.ts';
import { createRegistryClient, type RegistryClientDependencies, type RegistryClient } from './registry-client.ts';

type NpmFetchOverrides = {
    readonly buffer?: SinonSpy;
    readonly json?: SinonSpy;
};

type FakeNpmFetch = SinonSpy & { json: SinonSpy };

function createFakeNpmFetch(overrides: NpmFetchOverrides = {}): FakeNpmFetch {
    const { buffer = fake(), json = fake() } = overrides;
    const npmFetch: FakeNpmFetch = fake.resolves({ buffer }) as FakeNpmFetch;
    npmFetch.json = json;
    return npmFetch;
}

type Overrides = {
    readonly publish?: SinonSpy;
    readonly npmFetchJson?: SinonSpy;
    readonly npmFetch?: FakeNpmFetch;
    readonly fetch?: typeof globalThis.fetch;
    readonly clock?: FakeClock;
    readonly resolveIdToken?: (auth: Extract<PublishAuthStrategy, { type: 'npm-oidc' }>) => Promise<string>;
    readonly promptForOneTimePassword?: () => Promise<string | undefined>;
};

function registryClientFactory(overrides: Readonly<Overrides> = {}): RegistryClient {
    const {
        publish = fake(),
        npmFetchJson = fake(),
        npmFetch = createFakeNpmFetch({ json: npmFetchJson }),
        fetch: fetchImplementation = fake.resolves({
            ok: true,
            status: 201,
            json: fake.resolves({
                token_type: 'oidc',
                token: 'oidc-exchange-token',
                created: '2026-05-06T10:00:00.000Z',
                expires: '2026-05-06T11:00:00.000Z'
            })
        }) as unknown as typeof globalThis.fetch,
        clock = createFakeClock({ initialTimestamp: Date.parse('2026-05-06T10:00:00.000Z') }),
        resolveIdToken = fake.resolves('upstream-id-token')
    } = overrides;

    return createRegistryClient({
        publish,
        npmFetch,
        fetch: fetchImplementation,
        clock,
        resolveIdToken,
        promptForOneTimePassword: overrides.promptForOneTimePassword
    } as unknown as RegistryClientDependencies);
}

function getPublishedToken(publish: SinonSpy, callIndex = 0): string {
    return (publish.getCall(callIndex).lastArg as { readonly forceAuth: { readonly token: string } }).forceAuth.token;
}

async function expectFailure(action: () => Promise<unknown>, expectedError: RegExp): Promise<void> {
    try {
        await action();
        assert.fail('Expected the action to throw an error');
    } catch (error: unknown) {
        assert.match(String(error), expectedError);
    }
}

function buildLatestVersionFetchJson(): SinonSpy {
    return fake.resolves({
        name: '',
        'dist-tags': { latest: '1' },
        versions: { 1: { dist: { tarball: '' } } }
    });
}

test('publishPackage() uses shorthand bearer auth and one-time-password prompt when provided', async () => {
    const publish = fake.resolves(undefined);
    const promptForOneTimePassword = fake.resolves('123456');
    const registryClient = registryClientFactory({ publish, promptForOneTimePassword });
    const tarData = Buffer.from([1, 2, 3, 4]);

    await registryClient.publishPackage(
        { name: 'the-name', version: 'the-version' },
        tarData,
        {
            auth: { type: 'bearer-token', token: 'the-token' }
        },
        { access: 'public' }
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

test('publishPackage() uses explicit basic auth when configured', async () => {
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
        { access: 'public' }
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

test('fetchLatestVersion() uses shorthand auth for metadata by default', async () => {
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

test('fetchLatestVersion() uses explicit metadata auth when configured', async () => {
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

test('fetchLatestVersion() uses explicit bearer metadata auth when configured', async () => {
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

test('fetchLatestVersion() inherits publish auth for metadata by default when expanded auth omits metadata', async () => {
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

test('fetchLatestVersion() uses anonymous metadata access by default for explicit npm oidc auth', async () => {
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

test('fetchLatestVersion() uses shorthand npm oidc auth without attaching metadata credentials', async () => {
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

test('fetchLatestVersion() uses anonymous metadata access by default for shorthand npm oidc auth', async () => {
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

test('fetchLatestVersion() uses anonymous metadata access when explicitly configured', async () => {
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

test('fetchLatestVersion() inherits publish auth for metadata when explicit metadata mode requests it', async () => {
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

test('fetchLatestVersion() treats inherit-publish-auth as anonymous when publish auth uses npm oidc', async () => {
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

test('metadata auto retries with publish auth on a 401 challenge', async () => {
    const error = new Error('auth required');
    // @ts-expect-error intentional test shape
    error.statusCode = 401;
    let callCount = 0;
    const npmFetchJson = fake(async () => {
        callCount += 1;
        if (callCount === 1) {
            throw error;
        }
        return {
            name: '',
            'dist-tags': { latest: '1' },
            versions: { 1: { dist: { tarball: 'https://registry.example.test/pkg.tgz' } } }
        };
    });
    const registryClient = registryClientFactory({ npmFetchJson });

    const result = await registryClient.fetchLatestVersion('the-name', {
        auth: {
            publish: { type: 'bearer-token', token: 'writer-token' },
            metadata: 'auto'
        }
    });

    assert.deepStrictEqual(
        result,
        Maybe.just({
            version: '1',
            tarballUrl: 'https://registry.example.test/pkg.tgz'
        })
    );
    assert.strictEqual(npmFetchJson.callCount, 2);
    assert.deepStrictEqual(npmFetchJson.firstCall.args, [
        '/the-name',
        {
            alwaysAuth: true,
            registry: undefined,
            headers: { accept: 'application/vnd.npm.install-v1+json' }
        }
    ]);
    assert.deepStrictEqual(npmFetchJson.secondCall.args, [
        '/the-name',
        {
            alwaysAuth: true,
            registry: undefined,
            forceAuth: { token: 'writer-token' },
            headers: { accept: 'application/vnd.npm.install-v1+json' }
        }
    ]);
});

test('metadata auto retries with publish auth on a 403 challenge', async () => {
    const error = new Error('auth required');
    // @ts-expect-error intentional test shape
    error.statusCode = 403;
    let callCount = 0;
    const npmFetchJson = fake(async () => {
        callCount += 1;
        if (callCount === 1) {
            throw error;
        }

        return {
            name: '',
            'dist-tags': { latest: '1' },
            versions: { 1: { dist: { tarball: 'https://registry.example.test/pkg.tgz' } } }
        };
    });
    const registryClient = registryClientFactory({ npmFetchJson });

    const result = await registryClient.fetchLatestVersion('the-name', {
        auth: {
            publish: { type: 'bearer-token', token: 'writer-token' },
            metadata: 'auto'
        }
    });

    assert.deepStrictEqual(
        result,
        Maybe.just({
            version: '1',
            tarballUrl: 'https://registry.example.test/pkg.tgz'
        })
    );
    assert.strictEqual(npmFetchJson.callCount, 2);
});

test('metadata auto does not retry when the registry returns 404', async () => {
    const error = new Error('not found');
    // @ts-expect-error intentional test shape
    error.statusCode = 404;
    const npmFetchJson = fake.rejects(error);
    const registryClient = registryClientFactory({ npmFetchJson });

    const result = await registryClient.fetchLatestVersion('the-name', {
        auth: {
            publish: { type: 'bearer-token', token: 'writer-token' },
            metadata: 'auto'
        }
    });

    assert.deepStrictEqual(result, Maybe.nothing());
    assert.strictEqual(npmFetchJson.callCount, 1);
});

test('metadata auto does not retry when publish auth uses npm oidc', async () => {
    const error = new Error('auth required');
    // @ts-expect-error intentional test shape
    error.statusCode = 401;
    const npmFetchJson = fake.rejects(error);
    const registryClient = registryClientFactory({ npmFetchJson });

    await expectFailure(async () => {
        await registryClient.fetchLatestVersion('the-name', {
            auth: {
                publish: { type: 'npm-oidc', provider: 'env' },
                metadata: 'auto'
            }
        });
    }, /^Error: auth required$/u);

    assert.strictEqual(npmFetchJson.callCount, 1);
});

test('metadata auto does not retry when the registry returns a non-auth error', async () => {
    const error = new Error('server error');
    // @ts-expect-error intentional test shape
    error.statusCode = 500;
    const npmFetchJson = fake.rejects(error);
    const registryClient = registryClientFactory({ npmFetchJson });

    await expectFailure(async () => {
        await registryClient.fetchLatestVersion('the-name', {
            auth: {
                publish: { type: 'bearer-token', token: 'writer-token' },
                metadata: 'auto'
            }
        });
    }, /^Error: server error$/u);

    assert.strictEqual(npmFetchJson.callCount, 1);
});

test('metadata auto rethrows non-object errors without retrying', async () => {
    const npmFetchJson = fake(async () => {
        // eslint-disable-next-line no-throw-literal, @typescript-eslint/only-throw-error -- intentional non-object rejection to exercise the isRecord(false) branch
        throw 'server-error';
    });
    const registryClient = registryClientFactory({ npmFetchJson });

    await expectFailure(async () => {
        await registryClient.fetchLatestVersion('the-name', {
            auth: {
                publish: { type: 'bearer-token', token: 'writer-token' },
                metadata: 'auto'
            }
        });
    }, /^server-error$/u);

    assert.strictEqual(npmFetchJson.callCount, 1);
});

test('metadata auto rethrows object errors without statusCode without retrying', async () => {
    const npmFetchJson = fake.rejects(new Error('server-error'));
    const registryClient = registryClientFactory({ npmFetchJson });

    await expectFailure(async () => {
        await registryClient.fetchLatestVersion('the-name', {
            auth: {
                publish: { type: 'bearer-token', token: 'writer-token' },
                metadata: 'auto'
            }
        });
    }, /^Error: server-error$/u);

    assert.strictEqual(npmFetchJson.callCount, 1);
});

test('metadata using inherited publish auth does not retry on a 401 challenge', async () => {
    const error = new Error('auth required');
    // @ts-expect-error intentional test shape
    error.statusCode = 401;
    const npmFetchJson = fake.rejects(error);
    const registryClient = registryClientFactory({ npmFetchJson });

    await expectFailure(async () => {
        await registryClient.fetchLatestVersion('the-name', {
            auth: { type: 'bearer-token', token: 'writer-token' }
        });
    }, /^Error: auth required$/u);

    assert.strictEqual(npmFetchJson.callCount, 1);
});

test('anonymous metadata access does not retry on a 401 challenge', async () => {
    const error = new Error('auth required');
    // @ts-expect-error intentional test shape
    error.statusCode = 401;
    const npmFetchJson = fake.rejects(error);
    const registryClient = registryClientFactory({ npmFetchJson });

    await expectFailure(async () => {
        await registryClient.fetchLatestVersion('the-name', {
            auth: {
                publish: { type: 'bearer-token', token: 'writer-token' },
                metadata: 'anonymous'
            }
        });
    }, /^Error: auth required$/u);

    assert.strictEqual(npmFetchJson.callCount, 1);
});

test('basic metadata auth does not retry on a 401 challenge', async () => {
    const error = new Error('auth required');
    // @ts-expect-error intentional test shape
    error.statusCode = 401;
    const npmFetchJson = fake.rejects(error);
    const registryClient = registryClientFactory({ npmFetchJson });

    await expectFailure(async () => {
        await registryClient.fetchLatestVersion('the-name', {
            auth: {
                publish: { type: 'bearer-token', token: 'writer-token' },
                metadata: { type: 'basic', username: 'reader', password: 'reader-secret' }
            }
        });
    }, /^Error: auth required$/u);

    assert.strictEqual(npmFetchJson.callCount, 1);
});

test('fetchTarball() also retries metadata auto with publish auth on a 401 challenge', async () => {
    const error = new Error('auth required');
    // @ts-expect-error intentional test shape
    error.statusCode = 401;
    let callCount = 0;
    const npmFetch = fake(async () => {
        callCount += 1;
        if (callCount === 1) {
            throw error;
        }

        return {
            buffer: fake.resolves(Buffer.from([1, 2, 3]))
        };
    }) as unknown as FakeNpmFetch;
    npmFetch.json = fake();
    const registryClient = registryClientFactory({ npmFetch });

    const result = await registryClient.fetchTarball('https://registry.example.test/pkg.tgz', {
        auth: {
            publish: { type: 'basic', username: 'reader', password: 'reader-secret' },
            metadata: 'auto'
        }
    });

    assert.deepStrictEqual(result, Buffer.from([1, 2, 3]));
    assert.strictEqual(npmFetch.callCount, 2);
    assert.deepStrictEqual(npmFetch.secondCall.args, [
        'https://registry.example.test/pkg.tgz',
        {
            alwaysAuth: true,
            registry: undefined,
            forceAuth: {
                _auth: Buffer.from('reader:reader-secret', 'utf8').toString('base64')
            }
        }
    ]);
});

test('fetchLatestVersion() escapes scoped package names', async () => {
    const npmFetchJson = buildLatestVersionFetchJson();
    const registryClient = registryClientFactory({ npmFetchJson });

    await registryClient.fetchLatestVersion('@the/name', {
        auth: { type: 'bearer-token', token: 'the-token' }
    });

    assert.strictEqual(npmFetchJson.firstCall.firstArg, '/@the%2Fname');
});

test('publishPackage() resolves and exchanges npm oidc id tokens', async () => {
    const publish = fake.resolves(undefined);
    const resolveIdToken = fake.resolves('upstream-id-token');
    const fetchSpy = fake.resolves({
        ok: true,
        status: 201,
        json: fake.resolves({
            token_type: 'oidc',
            token: 'oidc-exchange-token',
            created: '2026-05-06T10:00:00.000Z',
            expires: '2026-05-06T11:00:00.000Z'
        })
    }) as unknown as typeof globalThis.fetch;
    const registryClient = registryClientFactory({
        publish,
        fetch: fetchSpy,
        resolveIdToken
    });

    await registryClient.publishPackage(
        { name: '@scope/the-name', version: '1.0.0' },
        Buffer.from([]),
        {
            auth: {
                publish: { type: 'npm-oidc', provider: 'github-actions' },
                metadata: 'anonymous'
            }
        },
        { access: 'public' }
    );

    assert.deepStrictEqual(resolveIdToken.firstCall.args, [{ type: 'npm-oidc', provider: 'github-actions' }]);
    assert.deepStrictEqual((fetchSpy as unknown as SinonSpy).firstCall.args, [
        'https://registry.npmjs.org/-/npm/v1/oidc/token/exchange/package/@scope%2Fthe-name',
        {
            method: 'POST',
            headers: { Authorization: 'Bearer upstream-id-token' }
        }
    ]);
    assert.strictEqual(getPublishedToken(publish), 'oidc-exchange-token');
});

test('publishPackage() exchanges npm oidc tokens and caches the exchange token per package', async () => {
    const publish = fake.resolves(undefined);
    const clock = createFakeClock({ initialTimestamp: Date.parse('2026-05-06T10:00:00.000Z') });
    const fetchSpy = fake.resolves({
        ok: true,
        status: 201,
        json: fake.resolves({
            token_type: 'oidc',
            token: 'oidc-exchange-token',
            created: '2026-05-06T10:00:00.000Z',
            expires: '2026-05-06T11:00:00.000Z'
        })
    }) as unknown as typeof globalThis.fetch;
    const registryClient = registryClientFactory({
        publish,
        fetch: fetchSpy,
        clock,
        resolveIdToken: fake.resolves('upstream-id-token')
    });

    await registryClient.publishPackage(
        { name: '@scope/the-name', version: '1.0.0' },
        Buffer.from([]),
        {
            auth: {
                publish: { type: 'npm-oidc', provider: 'env' },
                metadata: 'anonymous'
            }
        },
        { access: 'public' }
    );
    await registryClient.publishPackage(
        { name: '@scope/the-name', version: '1.0.1' },
        Buffer.from([]),
        {
            auth: {
                publish: { type: 'npm-oidc', provider: 'env' },
                metadata: 'anonymous'
            }
        },
        { access: 'public' }
    );

    assert.strictEqual((fetchSpy as unknown as SinonSpy).callCount, 1);
    assert.deepStrictEqual((fetchSpy as unknown as SinonSpy).firstCall.args, [
        'https://registry.npmjs.org/-/npm/v1/oidc/token/exchange/package/@scope%2Fthe-name',
        {
            method: 'POST',
            headers: { Authorization: 'Bearer upstream-id-token' }
        }
    ]);
    assert.strictEqual(getPublishedToken(publish), 'oidc-exchange-token');
    assert.strictEqual(getPublishedToken(publish, 1), 'oidc-exchange-token');
});

test('publishPackage() passes shorthand npm oidc auth through to the id token resolver', async () => {
    const publish = fake.resolves(undefined);
    const resolveIdToken = fake.resolves('upstream-id-token');
    const fetchSpy = fake.resolves({
        ok: true,
        status: 201,
        json: fake.resolves({
            token_type: 'oidc',
            token: 'oidc-exchange-token',
            created: '2026-05-06T10:00:00.000Z',
            expires: '2026-05-06T11:00:00.000Z'
        })
    }) as unknown as typeof globalThis.fetch;
    const registryClient = registryClientFactory({
        publish,
        fetch: fetchSpy,
        resolveIdToken
    });

    await registryClient.publishPackage(
        { name: 'the-name', version: '1.0.0' },
        Buffer.from([]),
        {
            auth: { type: 'npm-oidc' }
        },
        { access: 'public' }
    );

    assert.deepStrictEqual(resolveIdToken.firstCall.args, [{ type: 'npm-oidc' }]);
    assert.strictEqual(getPublishedToken(publish), 'oidc-exchange-token');
});

test('publishPackage() refreshes the exchanged npm oidc token after expiry', async () => {
    const publish = fake.resolves(undefined);
    const clock = createFakeClock({ initialTimestamp: Date.parse('2026-05-06T10:00:00.000Z') });
    const fetchSpy = fake.resolves({
        ok: true,
        status: 201,
        json: fake.resolves({
            token_type: 'oidc',
            token: 'oidc-exchange-token',
            created: '2026-05-06T10:00:00.000Z',
            expires: '2026-05-06T10:01:00.000Z'
        })
    }) as unknown as typeof globalThis.fetch;
    const registryClient = registryClientFactory({
        publish,
        fetch: fetchSpy,
        clock,
        resolveIdToken: fake.resolves('upstream-id-token')
    });

    await registryClient.publishPackage(
        { name: '@scope/the-name', version: '1.0.0' },
        Buffer.from([]),
        {
            auth: {
                publish: { type: 'npm-oidc', provider: 'env' },
                metadata: 'anonymous'
            }
        },
        { access: 'public' }
    );

    clock.tick(61_000);

    await registryClient.publishPackage(
        { name: '@scope/the-name', version: '1.0.1' },
        Buffer.from([]),
        {
            auth: {
                publish: { type: 'npm-oidc', provider: 'env' },
                metadata: 'anonymous'
            }
        },
        { access: 'public' }
    );

    assert.strictEqual((fetchSpy as unknown as SinonSpy).callCount, 2);
});

test('publishPackage() refreshes the exchanged npm oidc token when exactly 60 seconds remain', async () => {
    const publish = fake.resolves(undefined);
    const clock = createFakeClock({ initialTimestamp: Date.parse('2026-05-06T10:00:00.000Z') });
    const fetchSpy = fake.resolves({
        ok: true,
        status: 201,
        json: fake.resolves({
            token_type: 'oidc',
            token: 'oidc-exchange-token',
            created: '2026-05-06T10:00:00.000Z',
            expires: '2026-05-06T10:01:00.000Z'
        })
    }) as unknown as typeof globalThis.fetch;
    const registryClient = registryClientFactory({
        publish,
        fetch: fetchSpy,
        clock,
        resolveIdToken: fake.resolves('upstream-id-token')
    });

    await registryClient.publishPackage(
        { name: '@scope/the-name', version: '1.0.0' },
        Buffer.from([]),
        {
            auth: {
                publish: { type: 'npm-oidc', provider: 'env' },
                metadata: 'anonymous'
            }
        },
        { access: 'public' }
    );

    await registryClient.publishPackage(
        { name: '@scope/the-name', version: '1.0.1' },
        Buffer.from([]),
        {
            auth: {
                publish: { type: 'npm-oidc', provider: 'env' },
                metadata: 'anonymous'
            }
        },
        { access: 'public' }
    );

    assert.strictEqual((fetchSpy as unknown as SinonSpy).callCount, 2);
});

test('publishPackage() caches exchanged npm oidc tokens per package name', async () => {
    const publish = fake.resolves(undefined);
    const fetchSpy = fake.resolves({
        ok: true,
        status: 201,
        json: fake.resolves({
            token_type: 'oidc',
            token: 'oidc-exchange-token',
            created: '2026-05-06T10:00:00.000Z',
            expires: '2026-05-06T11:00:00.000Z'
        })
    }) as unknown as typeof globalThis.fetch;
    const registryClient = registryClientFactory({
        publish,
        fetch: fetchSpy,
        resolveIdToken: fake.resolves('upstream-id-token')
    });

    await registryClient.publishPackage(
        { name: '@scope/first-package', version: '1.0.0' },
        Buffer.from([]),
        {
            auth: {
                publish: { type: 'npm-oidc', provider: 'env' },
                metadata: 'anonymous'
            }
        },
        { access: 'public' }
    );
    await registryClient.publishPackage(
        { name: '@scope/second-package', version: '1.0.0' },
        Buffer.from([]),
        {
            auth: {
                publish: { type: 'npm-oidc', provider: 'env' },
                metadata: 'anonymous'
            }
        },
        { access: 'public' }
    );

    assert.strictEqual((fetchSpy as unknown as SinonSpy).callCount, 2);
    assert.deepStrictEqual((fetchSpy as unknown as SinonSpy).firstCall.args, [
        'https://registry.npmjs.org/-/npm/v1/oidc/token/exchange/package/@scope%2Ffirst-package',
        {
            method: 'POST',
            headers: { Authorization: 'Bearer upstream-id-token' }
        }
    ]);
    assert.deepStrictEqual((fetchSpy as unknown as SinonSpy).secondCall.args, [
        'https://registry.npmjs.org/-/npm/v1/oidc/token/exchange/package/@scope%2Fsecond-package',
        {
            method: 'POST',
            headers: { Authorization: 'Bearer upstream-id-token' }
        }
    ]);
});

test('publishPackage() reuses exchanged npm oidc tokens between implicit and explicit npm registry URLs', async () => {
    const publish = fake.resolves(undefined);
    const fetchSpy = fake.resolves({
        ok: true,
        status: 201,
        json: fake.resolves({
            token_type: 'oidc',
            token: 'oidc-exchange-token',
            created: '2026-05-06T10:00:00.000Z',
            expires: '2026-05-06T11:00:00.000Z'
        })
    }) as unknown as typeof globalThis.fetch;
    const registryClient = registryClientFactory({
        publish,
        fetch: fetchSpy,
        resolveIdToken: fake.resolves('upstream-id-token')
    });

    await registryClient.publishPackage(
        { name: '@scope/the-name', version: '1.0.0' },
        Buffer.from([]),
        {
            auth: {
                publish: { type: 'npm-oidc', provider: 'env' },
                metadata: 'anonymous'
            }
        },
        { access: 'public' }
    );
    await registryClient.publishPackage(
        { name: '@scope/the-name', version: '1.0.1' },
        Buffer.from([]),
        {
            registryUrl: 'https://registry.npmjs.org/',
            auth: {
                publish: { type: 'npm-oidc', provider: 'env' },
                metadata: 'anonymous'
            }
        },
        { access: 'public' }
    );

    assert.strictEqual((fetchSpy as unknown as SinonSpy).callCount, 1);
});

test('publishPackage() rejects npm oidc auth for non-npm registries', async () => {
    const registryClient = registryClientFactory({
        resolveIdToken: fake.resolves('upstream-id-token')
    });

    await expectFailure(async () => {
        await registryClient.publishPackage(
            { name: 'the-name', version: '1.0.0' },
            Buffer.from([]),
            {
                registryUrl: 'https://registry.example.test',
                auth: {
                    publish: { type: 'npm-oidc', provider: 'env' },
                    metadata: 'anonymous'
                }
            },
            { access: 'public' }
        );
    }, /^Error: npm-oidc auth is only supported with the npmjs.org registry$/u);
});

test('publishPackage() rejects an invalid OIDC exchange response body', async () => {
    const fetchSpy = fake.resolves({
        ok: true,
        status: 201,
        json: fake.resolves({ token: 'missing-fields' })
    }) as unknown as typeof globalThis.fetch;
    const registryClient = registryClientFactory({
        fetch: fetchSpy,
        resolveIdToken: fake.resolves('upstream-id-token')
    });

    await expectFailure(async () => {
        await registryClient.publishPackage(
            { name: 'the-name', version: '1.0.0' },
            Buffer.from([]),
            {
                auth: {
                    publish: { type: 'npm-oidc', provider: 'env' },
                    metadata: 'anonymous'
                }
            },
            { access: 'public' }
        );
    }, /^TypeError: OIDC token exchange returned an invalid response$/u);
});

test('publishPackage() rejects a non-object OIDC exchange response body', async () => {
    const fetchSpy = fake.resolves({
        ok: true,
        status: 201,
        json: fake.resolves('invalid-response')
    }) as unknown as typeof globalThis.fetch;
    const registryClient = registryClientFactory({
        fetch: fetchSpy,
        resolveIdToken: fake.resolves('upstream-id-token')
    });

    await expectFailure(async () => {
        await registryClient.publishPackage(
            { name: 'the-name', version: '1.0.0' },
            Buffer.from([]),
            {
                auth: {
                    publish: { type: 'npm-oidc', provider: 'env' },
                    metadata: 'anonymous'
                }
            },
            { access: 'public' }
        );
    }, /^TypeError: OIDC token exchange returned an invalid response$/u);
});

test('publishPackage() rejects a null OIDC exchange response body', async () => {
    const fetchSpy = fake.resolves({
        ok: true,
        status: 201,
        json: fake.resolves(null)
    }) as unknown as typeof globalThis.fetch;
    const registryClient = registryClientFactory({
        fetch: fetchSpy,
        resolveIdToken: fake.resolves('upstream-id-token')
    });

    await expectFailure(async () => {
        await registryClient.publishPackage(
            { name: 'the-name', version: '1.0.0' },
            Buffer.from([]),
            {
                auth: {
                    publish: { type: 'npm-oidc', provider: 'env' },
                    metadata: 'anonymous'
                }
            },
            { access: 'public' }
        );
    }, /^TypeError: OIDC token exchange returned an invalid response$/u);
});

test('publishPackage() rejects a failing OIDC exchange request', async () => {
    const fetchSpy = fake.resolves({
        ok: false,
        status: 502,
        json: fake.resolves({})
    }) as unknown as typeof globalThis.fetch;
    const registryClient = registryClientFactory({
        fetch: fetchSpy,
        resolveIdToken: fake.resolves('upstream-id-token')
    });

    await expectFailure(async () => {
        await registryClient.publishPackage(
            { name: 'the-name', version: '1.0.0' },
            Buffer.from([]),
            {
                auth: {
                    publish: { type: 'npm-oidc', provider: 'env' },
                    metadata: 'anonymous'
                }
            },
            { access: 'public' }
        );
    }, /^Error: OIDC token exchange failed with status 502$/u);
});

test('publishPackage() rejects an invalid OIDC exchange expiry timestamp', async () => {
    const fetchSpy = fake.resolves({
        ok: true,
        status: 201,
        json: fake.resolves({
            token_type: 'oidc',
            token: 'oidc-exchange-token',
            created: '2026-05-06T10:00:00.000Z',
            expires: 'not-a-date'
        })
    }) as unknown as typeof globalThis.fetch;
    const registryClient = registryClientFactory({
        fetch: fetchSpy,
        resolveIdToken: fake.resolves('upstream-id-token')
    });

    await expectFailure(async () => {
        await registryClient.publishPackage(
            { name: 'the-name', version: '1.0.0' },
            Buffer.from([]),
            {
                auth: {
                    publish: { type: 'npm-oidc', provider: 'env' },
                    metadata: 'anonymous'
                }
            },
            { access: 'public' }
        );
    }, /^TypeError: OIDC token exchange returned an invalid expiry timestamp$/u);
});

for (const [testName, response] of [
    [
        'token_type is invalid',
        {
            token_type: 123,
            token: 'oidc-exchange-token',
            created: '2026-05-06T10:00:00.000Z',
            expires: '2026-05-06T11:00:00.000Z'
        }
    ],
    [
        'token is invalid',
        { token_type: 'oidc', token: 123, created: '2026-05-06T10:00:00.000Z', expires: '2026-05-06T11:00:00.000Z' }
    ],
    [
        'created is invalid',
        { token_type: 'oidc', token: 'oidc-exchange-token', created: 123, expires: '2026-05-06T11:00:00.000Z' }
    ],
    [
        'expires is invalid',
        { token_type: 'oidc', token: 'oidc-exchange-token', created: '2026-05-06T10:00:00.000Z', expires: 123 }
    ]
] as const) {
    test(`publishPackage() rejects an OIDC exchange response when ${testName}`, async () => {
        const fetchSpy = fake.resolves({
            ok: true,
            status: 201,
            json: fake.resolves(response)
        }) as unknown as typeof globalThis.fetch;
        const registryClient = registryClientFactory({
            fetch: fetchSpy,
            resolveIdToken: fake.resolves('upstream-id-token')
        });

        await expectFailure(async () => {
            await registryClient.publishPackage(
                { name: 'the-name', version: '1.0.0' },
                Buffer.from([]),
                {
                    auth: {
                        publish: { type: 'npm-oidc', provider: 'env' },
                        metadata: 'anonymous'
                    }
                },
                { access: 'public' }
            );
        }, /^TypeError: OIDC token exchange returned an invalid response$/u);
    });
}

test('fetchLatestVersion() returns nothing for 404 and 403 responses', async () => {
    for (const statusCode of [404, 403]) {
        const error = new Error('fetch-error');
        // @ts-expect-error -- intentional shape for npm fetch errors
        error.statusCode = statusCode;
        const registryClient = registryClientFactory({ npmFetchJson: fake.rejects(error) });

        const result = await registryClient.fetchLatestVersion('the-name', {
            auth: { type: 'bearer-token', token: 'the-token' }
        });

        assert.deepStrictEqual(result, Maybe.nothing());
    }
});

test('fetchLatestVersion() throws on invalid registry payloads', async () => {
    const registryClient = registryClientFactory({
        npmFetchJson: fake.resolves({ invalid: 'response-data' })
    });

    await expectFailure(async () => {
        await registryClient.fetchLatestVersion('the-name', {
            auth: { type: 'bearer-token', token: 'the-token' }
        });
    }, /^Error: Got an invalid response from registry API$/u);
});

test('fetchLatestVersion() throws on invalid non-object registry payloads', async () => {
    const registryClient = registryClientFactory({
        npmFetchJson: fake.resolves('invalid-response')
    });

    await expectFailure(async () => {
        await registryClient.fetchLatestVersion('the-name', {
            auth: { type: 'bearer-token', token: 'the-token' }
        });
    }, /^Error: Got an invalid response from registry API$/u);
});

test('fetchLatestVersion() returns nothing when the registry response has no latest tag', async () => {
    const registryClient = registryClientFactory({
        npmFetchJson: fake.resolves({
            name: 'the-name',
            'dist-tags': {},
            versions: { '1.0.0': { dist: { tarball: 'https://registry.example.test/pkg.tgz' } } }
        })
    });

    const result = await registryClient.fetchLatestVersion('the-name', {
        auth: { type: 'bearer-token', token: 'the-token' }
    });

    assert.deepStrictEqual(result, Maybe.nothing());
});

test('fetchLatestVersion() throws when the latest tag points to a missing version entry', async () => {
    const registryClient = registryClientFactory({
        npmFetchJson: fake.resolves({
            name: 'the-name',
            'dist-tags': { latest: '1.0.0' },
            versions: {}
        })
    });

    await expectFailure(async () => {
        await registryClient.fetchLatestVersion('the-name', {
            auth: { type: 'bearer-token', token: 'the-token' }
        });
    }, /^Error: Version "1.0.0" for package "the-name" has no entry in the registry response$/u);
});

for (const [testName, response] of [
    ['response is not an object', 'invalid-response'],
    ['dist-tags is not an object', { name: 'the-name', 'dist-tags': 'invalid', versions: {} }],
    ['dist-tags latest is not a string', { name: 'the-name', 'dist-tags': { latest: 1 }, versions: {} }],
    ['versions is not an object', { name: 'the-name', 'dist-tags': {}, versions: 'invalid' }],
    ['version dist is missing', { name: 'the-name', 'dist-tags': { latest: '1.0.0' }, versions: { '1.0.0': {} } }],
    [
        'version tarball is not a string',
        {
            name: 'the-name',
            'dist-tags': { latest: '1.0.0' },
            versions: { '1.0.0': { dist: { tarball: false } } }
        }
    ]
] as const) {
    test(`fetchLatestVersion() rejects invalid registry payloads when ${testName}`, async () => {
        const registryClient = registryClientFactory({
            npmFetchJson: fake.resolves(response)
        });

        await expectFailure(async () => {
            await registryClient.fetchLatestVersion('the-name', {
                auth: { type: 'bearer-token', token: 'the-token' }
            });
        }, /^Error: Got an invalid response from registry API$/u);
    });
}

test('fetchLatestVersion() rejects null versions payloads', async () => {
    const registryClient = registryClientFactory({
        npmFetchJson: fake.resolves({
            name: 'the-name',
            'dist-tags': { latest: '1.0.0' },
            versions: null
        })
    });

    await expectFailure(async () => {
        await registryClient.fetchLatestVersion('the-name', {
            auth: { type: 'bearer-token', token: 'the-token' }
        });
    }, /^Error: Got an invalid response from registry API$/u);
});

test('fetchLatestVersion() rethrows non-object unexpected errors', async () => {
    const registryClient = registryClientFactory({
        npmFetchJson: fake(async () => {
            // eslint-disable-next-line no-throw-literal, @typescript-eslint/only-throw-error -- intentional non-object rejection to exercise the isRecord(false) branch
            throw 'unexpected-failure';
        })
    });

    await expectFailure(async () => {
        await registryClient.fetchLatestVersion('the-name', {
            auth: { type: 'bearer-token', token: 'the-token' }
        });
    }, /^unexpected-failure$/u);
});

test('fetchLatestVersion() rethrows object unexpected errors without statusCode', async () => {
    const registryClient = registryClientFactory({
        npmFetchJson: fake.rejects(new Error('unexpected-failure'))
    });

    await expectFailure(async () => {
        await registryClient.fetchLatestVersion('the-name', {
            auth: { type: 'bearer-token', token: 'the-token' }
        });
    }, /^Error: unexpected-failure$/u);
});

test('publishPackage() forwards the access and provenance options resolved from publishSettings to libnpmpublish', async () => {
    const publish = fake.resolves(undefined);
    const registryClient = registryClientFactory({ publish });

    await registryClient.publishPackage(
        { name: 'the-name', version: '1.0.0' },
        Buffer.from([]),
        { auth: { type: 'bearer-token', token: 'the-token' } },
        { access: 'public', provenance: { type: 'auto' } }
    );

    const publishOptions = publish.firstCall.args.at(-1) as Record<string, unknown>;
    assert.strictEqual(publishOptions.access, 'public');
    assert.strictEqual(publishOptions.provenance, true);
});

test('publishPackage() rewrites a libnpmpublish error through the publish-settings bridge', async () => {
    const original = Object.assign(new Error('Automatic provenance generation not supported for provider: jenkins'), {
        code: 'EUSAGE'
    });
    const publish = fake.rejects(original);
    const registryClient = registryClientFactory({ publish });

    try {
        await registryClient.publishPackage(
            { name: 'the-name', version: '1.0.0' },
            Buffer.from([]),
            { auth: { type: 'bearer-token', token: 'the-token' } },
            { access: 'public', provenance: { type: 'auto' } }
        );
        assert.fail('Expected publishPackage() to throw');
    } catch (error: unknown) {
        assert.ok(error instanceof Error, 'Expected the thrown value to be an Error');
        assert.match(error.message, /^Provenance auto mode requires GitHub Actions or GitLab CI/u);
        assert.strictEqual(error.cause, original);
    }
});
