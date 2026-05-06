import assert from 'node:assert';
import { test } from 'mocha';
import { fake, type SinonSpy } from 'sinon';
import { Maybe } from 'true-myth';
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
};

function registryClientFactory(overrides: Readonly<Overrides>): RegistryClient {
    const {
        publish = fake(),
        npmFetchJson = fake(),
        npmFetch = createFakeNpmFetch({ json: npmFetchJson })
    } = overrides;
    const fakeDependencies = {
        publish,
        npmFetch
    } as unknown as RegistryClientDependencies;

    return createRegistryClient(fakeDependencies);
}

async function expectPublishPackageCall(
    settings: { readonly token: string; readonly registryUrl?: string },
    expectedRegistry: string | undefined
): Promise<void> {
    const publish = fake.resolves(undefined);
    const registryClient = registryClientFactory({ publish });
    const tarData = Buffer.from([1, 2, 3, 4]);

    await registryClient.publishPackage({ name: 'the-name', version: 'the-version' }, tarData, settings);

    assert.strictEqual(publish.callCount, 1);
    assert.deepStrictEqual(publish.firstCall.args, [
        { name: 'the-name', version: 'the-version' },
        tarData,
        { defaultTag: 'latest', forceAuth: { alwaysAuth: true, token: settings.token }, registry: expectedRegistry }
    ]);
}

test('publishPackage() calls npm publish function with the given manifest and tar data and the correct options', async () => {
    await expectPublishPackageCall({ token: 'the-token' }, undefined);
});

test('publishPackage() calls npm publish function with custom registry', async () => {
    await expectPublishPackageCall({ token: 'the-token', registryUrl: 'the-url' }, 'the-url');
});

function buildLatestVersionFetchJson(): SinonSpy {
    return fake.resolves({
        name: '',
        'dist-tags': { latest: '1' },
        versions: { 1: { dist: { shasum: '', tarball: '' } } }
    });
}

async function expectFetchLatestVersionEndpointCall(
    settings: { readonly token: string; readonly registryUrl?: string },
    expectedRegistry: string | undefined
): Promise<void> {
    const npmFetchJson = buildLatestVersionFetchJson();
    const registryClient = registryClientFactory({ npmFetchJson });

    await registryClient.fetchLatestVersion('the-name', settings);

    assert.strictEqual(npmFetchJson.callCount, 1);
    assert.deepStrictEqual(npmFetchJson.firstCall.args, [
        '/the-name',
        {
            forceAuth: { alwaysAuth: true, token: settings.token },
            headers: { accept: 'application/vnd.npm.install-v1+json' },
            registry: expectedRegistry
        }
    ]);
}

test('fetchLatestVersion() fetches the correct package endpoint with the correct authentication settings and headers', async () => {
    await expectFetchLatestVersionEndpointCall({ token: 'the-token' }, undefined);
});

test('fetchLatestVersion() fetches the correct package endpoint with the correct authentication settings and headers when using a custom registry', async () => {
    await expectFetchLatestVersionEndpointCall({ token: 'the-token', registryUrl: 'the-url' }, 'the-url');
});

test('fetchLatestVersion() fetches the correct package endpoint escaping the given name of a scoped package', async () => {
    const npmFetchJson = buildLatestVersionFetchJson();
    const registryClient = registryClientFactory({ npmFetchJson });

    await registryClient.fetchLatestVersion('@the/name', { token: 'the-token' });

    assert.strictEqual(npmFetchJson.callCount, 1);
    assert.strictEqual(npmFetchJson.firstCall.firstArg, '/@the%2Fname');
});

async function expectFetchLatestVersionRejectsWith(
    npmFetchJson: SinonSpy,
    expectation: (caughtError: unknown) => void
): Promise<void> {
    const registryClient = registryClientFactory({ npmFetchJson });
    try {
        await registryClient.fetchLatestVersion('@the/name', { token: '' });
        assert.fail('Expected fetchLatestVersion() to throw but it did not');
    } catch (caughtError: unknown) {
        expectation(caughtError);
    }
}

async function expectFetchLatestVersionInvalidResponse(npmFetchJson: SinonSpy): Promise<void> {
    const registryClient = registryClientFactory({ npmFetchJson });
    await assert.rejects(async () => {
        await registryClient.fetchLatestVersion('@the/name', { token: '' });
    }, /^Error: Got an invalid response from registry API$/u);
}

test('fetchLatestVersion() throws and propagates the error when npmFetch throws with a generic error', async () => {
    await expectFetchLatestVersionRejectsWith(fake.rejects(new Error('the-error')), (caughtError) => {
        assert.strictEqual((caughtError as Error).message, 'the-error');
    });
});

test('fetchLatestVersion() throws and propagates the error when npmFetch throws with a fetch-error and the status code is not 404 nor 403', async () => {
    const error = new Error('fetch-error');
    // @ts-expect-error -- ok in this case
    error.statusCode = 500;
    await expectFetchLatestVersionRejectsWith(fake.rejects(error), (caughtError) => {
        assert.deepStrictEqual(caughtError, error);
    });
});

test('fetchLatestVersion() throws when npmFetch resolves with an invalid response', async () => {
    await expectFetchLatestVersionRejectsWith(fake.resolves({ invalid: 'response-data' }), (caughtError) => {
        assert.strictEqual((caughtError as Error).message, 'Got an invalid response from registry API');
    });
});

test('fetchLatestVersion() throws when npmFetch resolves to a non-object value', async () => {
    await expectFetchLatestVersionInvalidResponse(fake.resolves('invalid'));
});

test('fetchLatestVersion() throws when npmFetch resolves with a non-object dist-tags value', async () => {
    await expectFetchLatestVersionInvalidResponse(fake.resolves({ name: '', 'dist-tags': 'latest', versions: {} }));
});

async function expectFetchLatestVersionResolvesToNothing(): Promise<void> {
    const npmFetchJson = fake.resolves({ name: '', 'dist-tags': {}, versions: {} });
    const registryClient = registryClientFactory({ npmFetchJson });

    const result = await registryClient.fetchLatestVersion('@the/name', { token: '' });
    assert.deepStrictEqual(result, Maybe.nothing());
}

test('fetchLatestVersion() returns nothing when the registry response has no latest tag', async () => {
    await expectFetchLatestVersionResolvesToNothing();
});

test('fetchLatestVersion() throws when npmFetch resolves without the package name field', async () => {
    await expectFetchLatestVersionInvalidResponse(
        fake.resolves({
            'dist-tags': { latest: '1' },
            versions: { 1: { dist: { shasum: 'abc', tarball: 'the-tarball' } } }
        })
    );
});

test('fetchLatestVersion() throws when npmFetch resolves without dist-tags.latest version details', async () => {
    await expectFetchLatestVersionInvalidResponse(fake.resolves({ name: '', 'dist-tags': { latest: '1' } }));
});

test('fetchLatestVersion() throws when npmFetch resolves without a dist shasum', async () => {
    await expectFetchLatestVersionInvalidResponse(
        fake.resolves({
            name: '',
            'dist-tags': { latest: '1' },
            versions: { 1: { dist: { tarball: 'the-tarball' } } }
        })
    );
});

test('fetchLatestVersion() throws when npmFetch resolves without a dist tarball url', async () => {
    await expectFetchLatestVersionInvalidResponse(
        fake.resolves({
            name: '',
            'dist-tags': { latest: '1' },
            versions: { 1: { dist: { shasum: 'abc' } } }
        })
    );
});

test('fetchLatestVersion() throws when npmFetch resolves with inconsistent data', async () => {
    const npmFetchJson = fake.resolves({
        name: '',
        'dist-tags': { latest: '1' },
        versions: { 2: { dist: { shasum: '', tarball: '' } } }
    });
    const registryClient = registryClientFactory({ npmFetchJson });

    try {
        await registryClient.fetchLatestVersion('@the/name', { token: '' });
        assert.fail('Expected fetchLatestVersion() to throw but it did not');
    } catch (caughtError: unknown) {
        assert.strictEqual((caughtError as Error).message, 'Version "1" for package "@the/name" is missing a shasum');
    }
});

async function expectFetchLatestVersionReturnsNothingForStatusCode(statusCode: number): Promise<void> {
    const error = new Error('fetch-error');
    // @ts-expect-error -- ok in this case
    error.statusCode = statusCode;
    const npmFetchJson = fake.rejects(error);
    const registryClient = registryClientFactory({ npmFetchJson });

    const result = await registryClient.fetchLatestVersion('@the/name', { token: '' });
    assert.deepStrictEqual(result, Maybe.nothing());
}

test('fetchLatestVersion() returns nothing when npmFetch throws a fetch error with status code 404', async () => {
    await expectFetchLatestVersionReturnsNothingForStatusCode(404);
});

async function expectFetchLatestVersionRethrowsValue(thrown: unknown): Promise<void> {
    const npmFetchJson = fake(async () => {
        throw thrown;
    });
    await expectFetchLatestVersionRejectsWith(npmFetchJson, (caughtError) => {
        assert.deepStrictEqual(caughtError, thrown);
    });
}

test('fetchLatestVersion() rethrows object-like errors that do not have a statusCode', async () => {
    await expectFetchLatestVersionRethrowsValue({ message: 'fetch-error' });
});

test('fetchLatestVersion() returns nothing when npmFetch throws a fetch error with status code 403', async () => {
    await expectFetchLatestVersionReturnsNothingForStatusCode(403);
});

test('fetchLatestVersion() rethrows non-object errors even when they look falsy', async () => {
    const npmFetchJson = fake(async () => {
        // eslint-disable-next-line no-throw-literal, @typescript-eslint/only-throw-error -- intentional passthrough test
        throw '';
    });
    await expectFetchLatestVersionRejectsWith(npmFetchJson, (caughtError) => {
        assert.strictEqual(caughtError, '');
    });
});

test('fetchLatestVersion() throws when dist-tags.latest is not a string', async () => {
    await expectFetchLatestVersionInvalidResponse(
        fake.resolves({
            name: '',
            'dist-tags': { latest: 1 },
            versions: { 1: { dist: { shasum: 'abc', tarball: 'the-tarball' } } }
        })
    );
});

test('fetchLatestVersion() throws when version data dist is missing entirely', async () => {
    await expectFetchLatestVersionInvalidResponse(
        fake.resolves({ name: '', 'dist-tags': { latest: '1' }, versions: { 1: {} } })
    );
});

test('fetchLatestVersion() rethrows thrown strings unchanged', async () => {
    const npmFetchJson = fake(async () => {
        // eslint-disable-next-line no-throw-literal, @typescript-eslint/only-throw-error -- intentional passthrough test
        throw 'fetch-error';
    });
    await expectFetchLatestVersionRejectsWith(npmFetchJson, (caughtError) => {
        assert.strictEqual(caughtError, 'fetch-error');
    });
});

test('fetchLatestVersion() rethrows thrown null values unchanged', async () => {
    const npmFetchJson = fake(async () => {
        // eslint-disable-next-line no-throw-literal, @typescript-eslint/only-throw-error -- intentional passthrough test
        throw null;
    });
    await expectFetchLatestVersionRejectsWith(npmFetchJson, (caughtError) => {
        assert.strictEqual(caughtError, null);
    });
});

test('fetchLatestVersion() rethrows thrown symbols unchanged', async () => {
    const error = Symbol('fetch-error');
    const npmFetchJson = fake(async () => {
        // eslint-disable-next-line @typescript-eslint/only-throw-error -- intentional passthrough test
        throw error;
    });
    await expectFetchLatestVersionRejectsWith(npmFetchJson, (caughtError) => {
        assert.strictEqual(caughtError, error);
    });
});

test('fetchLatestVersion() rethrows errors with non-404/403 statusCode-like values', async () => {
    await expectFetchLatestVersionRethrowsValue({ statusCode: '404', message: 'fetch-error' });
});

test('fetchLatestVersion() returns nothing when npmFetch throws a fetch error with status code 403', async () => {
    await expectFetchLatestVersionReturnsNothingForStatusCode(403);
});

test('fetchLatestVersion() returns the version details when npmFetch returned the expected data', async () => {
    const npmFetchJson = fake.resolves({
        name: '',
        'dist-tags': { latest: '1' },
        versions: { 1: { dist: { shasum: 'abc', tarball: 'the-tarball' } } }
    });
    const registryClient = registryClientFactory({ npmFetchJson });

    const result = await registryClient.fetchLatestVersion('@the/name', { token: '' });
    assert.deepStrictEqual(result, Maybe.just({ version: '1', shasum: 'abc', tarballUrl: 'the-tarball' }));
});

test('fetchLatestVersion() returns nothing when the package has no latest dist-tag', async () => {
    await expectFetchLatestVersionResolvesToNothing();
});

test('fetchTarball() fetches the tarball at the given url', async () => {
    const npmFetch = createFakeNpmFetch();
    const registryClient = registryClientFactory({ npmFetch });

    await registryClient.fetchTarball('the-tarball-url', 'the-shasum');

    assert.strictEqual(npmFetch.callCount, 1);
    assert.deepStrictEqual(npmFetch.firstCall.args, ['the-tarball-url']);
});

test('fetchTarball() returns the buffer of the fetched tarball', async () => {
    const npmFetch = createFakeNpmFetch({ buffer: fake.resolves(Buffer.from([1, 2, 3])) });
    const registryClient = registryClientFactory({ npmFetch });

    const result = await registryClient.fetchTarball('', '');

    assert.deepStrictEqual(result, Buffer.from([1, 2, 3]));
});

async function expectFetchTarballRejectsWith(error: Error, expectedMessage: string): Promise<void> {
    const npmFetch = fake.rejects(error) as FakeNpmFetch;
    const registryClient = registryClientFactory({ npmFetch });
    try {
        await registryClient.fetchTarball('', '');
        assert.fail('Expected fetchTarball() should fail but it did not');
    } catch (caughtError: unknown) {
        assert.strictEqual((caughtError as Error).message, expectedMessage);
    }
}

test('fetchTarball() throws when npmFetch throws a fetch error with status code 404', async () => {
    const error = new Error('fetch-error');
    // @ts-expect-error -- ok in this case
    error.statusCode = 404;
    await expectFetchTarballRejectsWith(error, 'fetch-error');
});

test('fetchTarball() throws when npmFetch throws any error', async () => {
    await expectFetchTarballRejectsWith(new Error('any-error'), 'any-error');
});
