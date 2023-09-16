import test from 'node:test';
import assert from 'node:assert';
import {fake, SinonSpy} from 'sinon';
import {createRegistryClient, RegistryClientDependencies, RegistryClient} from './registry-client.js';
import {Maybe} from 'true-myth';

interface Overrides {
    publish?: SinonSpy;
    npmFetch?: SinonSpy;
}

function registryClientFactory(overrides: Overrides): RegistryClient {
    const {publish = fake(), npmFetch = fake()} = overrides;
    const fakeDependencies = {
        publish, npmFetch: {json: npmFetch}
    } as unknown as RegistryClientDependencies;

    return createRegistryClient(fakeDependencies);
}

test('publishPackage() calls npm publish function with the given manifest and tar data and the correct options', async () => {
    const publish = fake.resolves(undefined);
    const registryClient = registryClientFactory({publish});
    const tarData = Buffer.from([ 1, 2, 3, 4 ]);


    await registryClient.publishPackage({name: 'the-name', version: 'the-version'}, tarData, {token: 'the-token'});

    assert.strictEqual(publish.callCount, 1);
    assert.deepStrictEqual(publish.firstCall.args, [ {name: 'the-name', version: 'the-version'}, tarData, {defaultTag: 'latest', forceAuth: {alwaysAuth: true, token: 'the-token'}} ]);
});

test('fetchLatestVersion() fetches the correct package endpoint with the correct authentication settings and headers', async () => {
    const npmFetch = fake.resolves({name: '', 'dist-tags': {latest: '1'}, versions: {'1': {dist: {shasum: ''}}}});
    const registryClient = registryClientFactory({npmFetch});

    await registryClient.fetchLatestVersion('the-name', {token: 'the-token'});

    assert.strictEqual(npmFetch.callCount, 1);
    assert.deepStrictEqual(npmFetch.firstCall.args, [ '/the-name', {forceAuth: {alwaysAuth: true, token: 'the-token', }, headers: {accept: 'application/vnd.npm.install-v1+json'}} ]);
});

test('fetchLatestVersion() fetches the correct package endpoint escaping the given name of a scoped package', async () => {
    const npmFetch = fake.resolves({name: '', 'dist-tags': {latest: '1'}, versions: {'1': {dist: {shasum: ''}}}});
    const registryClient = registryClientFactory({npmFetch});

    await registryClient.fetchLatestVersion('@the/name', {token: 'the-token'});

    assert.strictEqual(npmFetch.callCount, 1);
    assert.strictEqual(npmFetch.firstCall.firstArg, '/@the%2Fname');
});

test('fetchLatestVersion() throws and propagates the error when npmFetch throws with a generic error', async () => {
    const error = new Error('the-error');
    const npmFetch = fake.rejects(error);
    const registryClient = registryClientFactory({npmFetch});

    try {
        await registryClient.fetchLatestVersion('@the/name', {token: ''});
        assert.fail('Expected fetchLatestVersion() to throw but it did not');
    } catch (caughtError: unknown) {
        assert.strictEqual((caughtError as Error).message, 'the-error');
    }
});

test('fetchLatestVersion() throws and propagates the error when npmFetch throws with a fetch-error and the status code is not 404 nor 403', async () => {
    const error = new Error('fetch-error');
    // @ts-expect-error
    error.statusCode = 500;
    const npmFetch = fake.rejects(error);
    const registryClient = registryClientFactory({npmFetch});

    try {
        await registryClient.fetchLatestVersion('@the/name', {token: ''});
        assert.fail('Expected fetchLatestVersion() to throw but it did not');
    } catch (caughtError: unknown) {
        assert.deepStrictEqual(caughtError, error);
    }
});

test('fetchLatestVersion() throws when npmFetch resolves with an invalid response', async () => {
    const npmFetch = fake.resolves({invalid: 'response-data'});
    const registryClient = registryClientFactory({npmFetch});

    try {
        await registryClient.fetchLatestVersion('@the/name', {token: ''});
        assert.fail('Expected fetchLatestVersion() to throw but it did not');
    } catch (caughtError: unknown) {
        assert.strictEqual((caughtError as Error).message, 'Got an invalid response from registry API');
    }
});

test('fetchLatestVersion() throws when npmFetch resolves with inconsistent data', async () => {
    const npmFetch = fake.resolves({name: '', 'dist-tags': {latest: '1'}, versions: {'2': {dist: {shasum: ''}}}});
    const registryClient = registryClientFactory({npmFetch});

    try {
        await registryClient.fetchLatestVersion('@the/name', {token: ''});
        assert.fail('Expected fetchLatestVersion() to throw but it did not');
    } catch (caughtError: unknown) {
        assert.strictEqual((caughtError as Error).message, 'The version information about the latest version 1 for package @the/name is missing');
    }
});

test('fetchLatestVersion() returns nothing when npmFetch throws a fetch error with status code 404', async () => {
    const error = new Error('fetch-error');
    // @ts-expect-error
    error.statusCode = 404;
    const npmFetch = fake.rejects(error);
    const registryClient = registryClientFactory({npmFetch});

    const result = await registryClient.fetchLatestVersion('@the/name', {token: ''});
    assert.deepStrictEqual(result, Maybe.nothing());
});

test('fetchLatestVersion() returns nothing when npmFetch throws a fetch error with status code 403', async () => {
    const error = new Error('fetch-error');
    // @ts-expect-error
    error.statusCode = 403;
    const npmFetch = fake.rejects(error);
    const registryClient = registryClientFactory({npmFetch});

    const result = await registryClient.fetchLatestVersion('@the/name', {token: ''});
    assert.deepStrictEqual(result, Maybe.nothing());
});

test('fetchLatestVersion() returns the version details when npmFetch returned the expected data', async () => {
    const npmFetch = fake.resolves({name: '', 'dist-tags': {latest: '1'}, versions: {'1': {dist: {shasum: 'abc'}}}});
    const registryClient = registryClientFactory({npmFetch});

    const result = await registryClient.fetchLatestVersion('@the/name', {token: ''});
    assert.deepStrictEqual(result, Maybe.just({version: '1', shasum: 'abc'}));
});
