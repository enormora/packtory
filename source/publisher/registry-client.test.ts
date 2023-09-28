import test from 'ava';
import { fake, type SinonSpy } from 'sinon';
import { Maybe } from 'true-myth';
import { createRegistryClient, type RegistryClientDependencies, type RegistryClient } from './registry-client.js';

type Overrides = {
    readonly publish?: SinonSpy;
    readonly npmFetch?: SinonSpy;
};

function registryClientFactory(overrides: Readonly<Overrides>): RegistryClient {
    const { publish = fake(), npmFetch = fake() } = overrides;
    const fakeDependencies = {
        publish,
        npmFetch: { json: npmFetch }
    } as unknown as RegistryClientDependencies;

    return createRegistryClient(fakeDependencies);
}

test('publishPackage() calls npm publish function with the given manifest and tar data and the correct options', async (t) => {
    const publish = fake.resolves(undefined);
    const registryClient = registryClientFactory({ publish });
    const tarData = Buffer.from([1, 2, 3, 4]);

    await registryClient.publishPackage({ name: 'the-name', version: 'the-version' }, tarData, { token: 'the-token' });

    t.is(publish.callCount, 1);
    t.deepEqual(publish.firstCall.args, [
        { name: 'the-name', version: 'the-version' },
        tarData,
        { defaultTag: 'latest', forceAuth: { alwaysAuth: true, token: 'the-token' } }
    ]);
});

test('fetchLatestVersion() fetches the correct package endpoint with the correct authentication settings and headers', async (t) => {
    const npmFetch = fake.resolves({
        name: '',
        'dist-tags': { latest: '1' },
        versions: { 1: { dist: { shasum: '' } } }
    });
    const registryClient = registryClientFactory({ npmFetch });

    await registryClient.fetchLatestVersion('the-name', { token: 'the-token' });

    t.is(npmFetch.callCount, 1);
    t.deepEqual(npmFetch.firstCall.args, [
        '/the-name',
        {
            forceAuth: { alwaysAuth: true, token: 'the-token' },
            headers: { accept: 'application/vnd.npm.install-v1+json' }
        }
    ]);
});

test('fetchLatestVersion() fetches the correct package endpoint escaping the given name of a scoped package', async (t) => {
    const npmFetch = fake.resolves({
        name: '',
        'dist-tags': { latest: '1' },
        versions: { 1: { dist: { shasum: '' } } }
    });
    const registryClient = registryClientFactory({ npmFetch });

    await registryClient.fetchLatestVersion('@the/name', { token: 'the-token' });

    t.is(npmFetch.callCount, 1);
    t.is(npmFetch.firstCall.firstArg, '/@the%2Fname');
});

test('fetchLatestVersion() throws and propagates the error when npmFetch throws with a generic error', async (t) => {
    const error = new Error('the-error');
    const npmFetch = fake.rejects(error);
    const registryClient = registryClientFactory({ npmFetch });

    try {
        await registryClient.fetchLatestVersion('@the/name', { token: '' });
        t.fail('Expected fetchLatestVersion() to throw but it did not');
    } catch (caughtError: unknown) {
        t.is((caughtError as Error).message, 'the-error');
    }
});

test('fetchLatestVersion() throws and propagates the error when npmFetch throws with a fetch-error and the status code is not 404 nor 403', async (t) => {
    const error = new Error('fetch-error');
    // @ts-expect-error
    error.statusCode = 500;
    const npmFetch = fake.rejects(error);
    const registryClient = registryClientFactory({ npmFetch });

    try {
        await registryClient.fetchLatestVersion('@the/name', { token: '' });
        t.fail('Expected fetchLatestVersion() to throw but it did not');
    } catch (caughtError: unknown) {
        t.deepEqual(caughtError, error);
    }
});

test('fetchLatestVersion() throws when npmFetch resolves with an invalid response', async (t) => {
    const npmFetch = fake.resolves({ invalid: 'response-data' });
    const registryClient = registryClientFactory({ npmFetch });

    try {
        await registryClient.fetchLatestVersion('@the/name', { token: '' });
        t.fail('Expected fetchLatestVersion() to throw but it did not');
    } catch (caughtError: unknown) {
        t.is((caughtError as Error).message, 'Got an invalid response from registry API');
    }
});

test('fetchLatestVersion() throws when npmFetch resolves with inconsistent data', async (t) => {
    const npmFetch = fake.resolves({
        name: '',
        'dist-tags': { latest: '1' },
        versions: { 2: { dist: { shasum: '' } } }
    });
    const registryClient = registryClientFactory({ npmFetch });

    try {
        await registryClient.fetchLatestVersion('@the/name', { token: '' });
        t.fail('Expected fetchLatestVersion() to throw but it did not');
    } catch (caughtError: unknown) {
        t.is((caughtError as Error).message, 'Version "1" for package "@the/name" is missing a shasum');
    }
});

test('fetchLatestVersion() returns nothing when npmFetch throws a fetch error with status code 404', async (t) => {
    const error = new Error('fetch-error');
    // @ts-expect-error
    error.statusCode = 404;
    const npmFetch = fake.rejects(error);
    const registryClient = registryClientFactory({ npmFetch });

    const result = await registryClient.fetchLatestVersion('@the/name', { token: '' });
    t.deepEqual(result, Maybe.nothing());
});

test('fetchLatestVersion() returns nothing when npmFetch throws a fetch error with status code 403', async (t) => {
    const error = new Error('fetch-error');
    // @ts-expect-error
    error.statusCode = 403;
    const npmFetch = fake.rejects(error);
    const registryClient = registryClientFactory({ npmFetch });

    const result = await registryClient.fetchLatestVersion('@the/name', { token: '' });
    t.deepEqual(result, Maybe.nothing());
});

test('fetchLatestVersion() returns the version details when npmFetch returned the expected data', async (t) => {
    const npmFetch = fake.resolves({
        name: '',
        'dist-tags': { latest: '1' },
        versions: { 1: { dist: { shasum: 'abc' } } }
    });
    const registryClient = registryClientFactory({ npmFetch });

    const result = await registryClient.fetchLatestVersion('@the/name', { token: '' });
    t.deepEqual(result, Maybe.just({ version: '1', shasum: 'abc' }));
});
