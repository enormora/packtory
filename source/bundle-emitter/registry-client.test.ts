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

test('publishPackage() calls npm publish function with the given manifest and tar data and the correct options', async () => {
    const publish = fake.resolves(undefined);
    const registryClient = registryClientFactory({ publish });
    const tarData = Buffer.from([1, 2, 3, 4]);

    await registryClient.publishPackage({ name: 'the-name', version: 'the-version' }, tarData, { token: 'the-token' });

    assert.strictEqual(publish.callCount, 1);
    assert.deepStrictEqual(publish.firstCall.args, [
        { name: 'the-name', version: 'the-version' },
        tarData,
        { defaultTag: 'latest', forceAuth: { alwaysAuth: true, token: 'the-token' }, registry: undefined }
    ]);
});

test('publishPackage() calls npm publish function with custom registry', async () => {
    const publish = fake.resolves(undefined);
    const registryClient = registryClientFactory({ publish });
    const tarData = Buffer.from([1, 2, 3, 4]);

    await registryClient.publishPackage({ name: 'the-name', version: 'the-version' }, tarData, {
        token: 'the-token',
        registryUrl: 'the-url'
    });

    assert.strictEqual(publish.callCount, 1);
    assert.deepStrictEqual(publish.firstCall.args, [
        { name: 'the-name', version: 'the-version' },
        tarData,
        { defaultTag: 'latest', forceAuth: { alwaysAuth: true, token: 'the-token' }, registry: 'the-url' }
    ]);
});

test('fetchLatestVersion() fetches the correct package endpoint with the correct authentication settings and headers', async () => {
    const npmFetchJson = fake.resolves({
        name: '',
        'dist-tags': { latest: '1' },
        versions: { 1: { dist: { shasum: '', tarball: '' } } }
    });
    const registryClient = registryClientFactory({ npmFetchJson });

    await registryClient.fetchLatestVersion('the-name', { token: 'the-token' });

    assert.strictEqual(npmFetchJson.callCount, 1);
    assert.deepStrictEqual(npmFetchJson.firstCall.args, [
        '/the-name',
        {
            forceAuth: { alwaysAuth: true, token: 'the-token' },
            headers: { accept: 'application/vnd.npm.install-v1+json' },
            registry: undefined
        }
    ]);
});

test('fetchLatestVersion() fetches the correct package endpoint with the correct authentication settings and headers when using a custom registry', async () => {
    const npmFetchJson = fake.resolves({
        name: '',
        'dist-tags': { latest: '1' },
        versions: { 1: { dist: { shasum: '', tarball: '' } } }
    });
    const registryClient = registryClientFactory({ npmFetchJson });

    await registryClient.fetchLatestVersion('the-name', { token: 'the-token', registryUrl: 'the-url' });

    assert.strictEqual(npmFetchJson.callCount, 1);
    assert.deepStrictEqual(npmFetchJson.firstCall.args, [
        '/the-name',
        {
            forceAuth: { alwaysAuth: true, token: 'the-token' },
            headers: { accept: 'application/vnd.npm.install-v1+json' },
            registry: 'the-url'
        }
    ]);
});

test('fetchLatestVersion() fetches the correct package endpoint escaping the given name of a scoped package', async () => {
    const npmFetchJson = fake.resolves({
        name: '',
        'dist-tags': { latest: '1' },
        versions: { 1: { dist: { shasum: '', tarball: '' } } }
    });
    const registryClient = registryClientFactory({ npmFetchJson });

    await registryClient.fetchLatestVersion('@the/name', { token: 'the-token' });

    assert.strictEqual(npmFetchJson.callCount, 1);
    assert.strictEqual(npmFetchJson.firstCall.firstArg, '/@the%2Fname');
});

test('fetchLatestVersion() throws and propagates the error when npmFetch throws with a generic error', async () => {
    const error = new Error('the-error');
    const npmFetchJson = fake.rejects(error);
    const registryClient = registryClientFactory({ npmFetchJson });

    try {
        await registryClient.fetchLatestVersion('@the/name', { token: '' });
        assert.fail('Expected fetchLatestVersion() to throw but it did not');
    } catch (caughtError: unknown) {
        assert.strictEqual((caughtError as Error).message, 'the-error');
    }
});

test('fetchLatestVersion() throws and propagates the error when npmFetch throws with a fetch-error and the status code is not 404 nor 403', async () => {
    const error = new Error('fetch-error');
    // @ts-expect-error -- ok in this case
    error.statusCode = 500;
    const npmFetchJson = fake.rejects(error);
    const registryClient = registryClientFactory({ npmFetchJson });

    try {
        await registryClient.fetchLatestVersion('@the/name', { token: '' });
        assert.fail('Expected fetchLatestVersion() to throw but it did not');
    } catch (caughtError: unknown) {
        assert.deepStrictEqual(caughtError, error);
    }
});

test('fetchLatestVersion() throws when npmFetch resolves with an invalid response', async () => {
    const npmFetchJson = fake.resolves({ invalid: 'response-data' });
    const registryClient = registryClientFactory({ npmFetchJson });

    try {
        await registryClient.fetchLatestVersion('@the/name', { token: '' });
        assert.fail('Expected fetchLatestVersion() to throw but it did not');
    } catch (caughtError: unknown) {
        assert.strictEqual((caughtError as Error).message, 'Got an invalid response from registry API');
    }
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

test('fetchLatestVersion() returns nothing when npmFetch throws a fetch error with status code 404', async () => {
    const error = new Error('fetch-error');
    // @ts-expect-error -- ok in this case
    error.statusCode = 404;
    const npmFetchJson = fake.rejects(error);
    const registryClient = registryClientFactory({ npmFetchJson });

    const result = await registryClient.fetchLatestVersion('@the/name', { token: '' });
    assert.deepStrictEqual(result, Maybe.nothing());
});

test('fetchLatestVersion() returns nothing when npmFetch throws a fetch error with status code 403', async () => {
    const error = new Error('fetch-error');
    // @ts-expect-error -- ok in this case
    error.statusCode = 403;
    const npmFetchJson = fake.rejects(error);
    const registryClient = registryClientFactory({ npmFetchJson });

    const result = await registryClient.fetchLatestVersion('@the/name', { token: '' });
    assert.deepStrictEqual(result, Maybe.nothing());
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
    const npmFetchJson = fake.resolves({
        name: '',
        'dist-tags': {},
        versions: {}
    });
    const registryClient = registryClientFactory({ npmFetchJson });

    const result = await registryClient.fetchLatestVersion('@the/name', { token: '' });
    assert.deepStrictEqual(result, Maybe.nothing());
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

test('fetchTarball() throws when npmFetch throws a fetch error with status code 404', async () => {
    const error = new Error('fetch-error');
    // @ts-expect-error -- ok in this case
    error.statusCode = 404;
    const npmFetch = fake.rejects(error) as FakeNpmFetch;
    const registryClient = registryClientFactory({ npmFetch });

    try {
        await registryClient.fetchTarball('', '');
        assert.fail('Expected fetchTarball() should fail but it did not');
    } catch (caughtError: unknown) {
        assert.strictEqual((caughtError as Error).message, 'fetch-error');
    }
});

test('fetchTarball() throws when npmFetch throws any error', async () => {
    const error = new Error('any-error');
    const npmFetch = fake.rejects(error) as FakeNpmFetch;
    const registryClient = registryClientFactory({ npmFetch });

    try {
        await registryClient.fetchTarball('', '');
        assert.fail('Expected fetchTarball() should fail but it did not');
    } catch (caughtError: unknown) {
        assert.strictEqual((caughtError as Error).message, 'any-error');
    }
});
