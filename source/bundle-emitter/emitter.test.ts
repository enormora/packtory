import assert from 'node:assert';
import { test } from 'mocha';
import { fake, type SinonSpy } from 'sinon';
import { Maybe } from 'true-myth';
import { versionedBundleWithManifest } from '../test-libraries/bundle-fixtures.ts';
import { createBundleEmitter, type BundleEmitterDependencies, type BundleEmitter } from './emitter.ts';

function namedBundle(): ReturnType<typeof versionedBundleWithManifest> {
    return versionedBundleWithManifest({ name: 'the-name' });
}

const emptyTarball = Buffer.from([
    31, 139, 8, 0, 0, 0, 0, 0, 2, 255, 99, 96, 24, 5, 163, 96, 20, 140, 84, 0, 0, 46, 175, 181, 239, 0, 4, 0, 0
]);
const tarballWithOneFile = Buffer.from(
    [
        [31, 139, 8, 0, 0, 0, 0, 0, 2, 255, 43, 72, 76, 206, 78, 76, 79, 213],
        [79, 203, 207, 215, 203, 42, 102, 160, 9, 48, 48, 48, 48, 51, 49, 81],
        [0, 209, 64, 128, 78, 131, 128, 177, 2, 130, 109, 160, 96, 96, 104, 104],
        [102, 110, 4, 148, 103, 160, 3, 40, 45, 46, 73, 44, 2, 58, 133, 10, 158],
        [68, 241, 220, 16, 1, 192, 120, 103, 24, 5, 163, 96, 20, 140, 130, 81, 48],
        [242, 0, 0, 60, 78, 198, 6, 0, 8, 0, 0]
    ].flat()
);

type Overrides = {
    readonly buildTarball?: SinonSpy;
    readonly publishPackage?: SinonSpy;
    readonly fetchLatestVersion?: SinonSpy;
    readonly collectContents?: SinonSpy;
    readonly fetchTarball?: SinonSpy;
};

function createSpy<TSpy extends SinonSpy>(spy: TSpy | undefined, fallback: () => TSpy): TSpy {
    return spy ?? fallback();
}

function emitterFactory(overrides: Overrides = {}): BundleEmitter {
    const dependencies: BundleEmitterDependencies = {
        artifactsBuilder: {
            buildTarball: createSpy(overrides.buildTarball, () => {
                return fake.resolves({});
            }),
            collectContents: createSpy(overrides.collectContents, () => {
                return fake.resolves([]);
            }),
            buildFolder: fake()
        },
        registryClient: {
            publishPackage: createSpy(overrides.publishPackage, fake),
            fetchLatestVersion: createSpy(overrides.fetchLatestVersion, fake),
            fetchTarball: createSpy(overrides.fetchTarball, () => {
                return fake.resolves(emptyTarball);
            })
        }
    };

    return createBundleEmitter(dependencies);
}

test('determineCurrentVersion() fetches the latest version when automatic versioning is enabled', async () => {
    const fetchLatestVersion = fake.resolves(Maybe.nothing());
    const emitter = emitterFactory({ fetchLatestVersion });

    await emitter.determineCurrentVersion({
        name: 'the-name',
        registrySettings: { token: 'the-token' },
        versioning: { automatic: true }
    });

    assert.strictEqual(fetchLatestVersion.callCount, 1);
    assert.deepStrictEqual(fetchLatestVersion.firstCall.args, ['the-name', { token: 'the-token' }]);
});

test('determineCurrentVersion() returns the fetched version when automatic versioning is enabled', async () => {
    const fetchLatestVersion = fake.resolves(Maybe.just({ version: 'the-version' }));
    const emitter = emitterFactory({ fetchLatestVersion });

    const result = await emitter.determineCurrentVersion({
        name: 'the-name',
        registrySettings: { token: 'the-token' },
        versioning: { automatic: true }
    });

    assert.deepStrictEqual(result, Maybe.just('the-version'));
});

test('determineCurrentVersion() doesn’t fetches the latest version when manual versioning is enabled', async () => {
    const fetchLatestVersion = fake.resolves(Maybe.nothing());
    const emitter = emitterFactory({ fetchLatestVersion });

    await emitter.determineCurrentVersion({
        name: 'the-name',
        registrySettings: { token: 'the-token' },
        versioning: { automatic: false, version: '' }
    });

    assert.strictEqual(fetchLatestVersion.callCount, 0);
});

test('determineCurrentVersion() returns the given version when manual versioning is enabled', async () => {
    const emitter = emitterFactory({});

    const result = await emitter.determineCurrentVersion({
        name: 'the-name',
        registrySettings: { token: 'the-token' },
        versioning: { automatic: false, version: 'manual-version' }
    });

    assert.deepStrictEqual(result, Maybe.just('manual-version'));
});

test('checkBundleAlreadyPublished() fetches the latest version', async () => {
    const fetchLatestVersion = fake.resolves(Maybe.nothing());
    const emitter = emitterFactory({ fetchLatestVersion });

    await emitter.checkBundleAlreadyPublished({
        registrySettings: { token: 'the-token' },
        bundle: namedBundle()
    });

    assert.strictEqual(fetchLatestVersion.callCount, 1);
    assert.deepStrictEqual(fetchLatestVersion.firstCall.args, ['the-name', { token: 'the-token' }]);
});

test('checkBundleAlreadyPublished() returns false when there is no latest version in the registry', async () => {
    const fetchLatestVersion = fake.resolves(Maybe.nothing());
    const collectContents = fake.returns([]);
    const emitter = emitterFactory({ fetchLatestVersion, collectContents });

    const result = await emitter.checkBundleAlreadyPublished({
        registrySettings: { token: 'the-token' },
        bundle: namedBundle()
    });

    assert.deepStrictEqual(result, { alreadyPublishedAsLatest: false });
    assert.strictEqual(collectContents.callCount, 0);
});

test('checkBundleAlreadyPublished() returns false when the latest version contents doesn’t match the given bundle', async () => {
    const fetchLatestVersion = fake.resolves(
        Maybe.just({ version: '1.2.3', tarballUrl: 'https://registry.example.test/package.tgz', shasum: 'def' })
    );
    const fetchTarball = fake.resolves(tarballWithOneFile);
    const collectContents = fake.returns([]);
    const emitter = emitterFactory({ fetchLatestVersion, fetchTarball, collectContents });

    const bundle = namedBundle();
    const result = await emitter.checkBundleAlreadyPublished({
        registrySettings: { token: 'the-token' },
        bundle
    });

    assert.deepStrictEqual(result, { alreadyPublishedAsLatest: false });
    assert.deepStrictEqual(collectContents.firstCall.args, [bundle, 'package']);
    assert.deepStrictEqual(fetchTarball.firstCall.args, ['https://registry.example.test/package.tgz', 'def']);
});

test('checkBundleAlreadyPublished() returns true when the latest version contents match the given bundle contents', async () => {
    const fetchLatestVersion = fake.resolves(
        Maybe.just({ version: '1.2.3', tarballUrl: 'https://registry.example.test/package.tgz', shasum: 'abc' })
    );
    const fetchTarball = fake.resolves(emptyTarball);
    const collectContents = fake.returns([]);
    const emitter = emitterFactory({ fetchLatestVersion, fetchTarball, collectContents });

    const result = await emitter.checkBundleAlreadyPublished({
        registrySettings: { token: 'the-token' },
        bundle: namedBundle()
    });

    assert.deepStrictEqual(result, { alreadyPublishedAsLatest: true });
    assert.deepStrictEqual(collectContents.firstCall.args.at(-1), 'package');
    assert.deepStrictEqual(fetchTarball.firstCall.args, ['https://registry.example.test/package.tgz', 'abc']);
});

test('publish() publishes the given bundle', async () => {
    const buildTarball = fake.resolves({ tarData: emptyTarball });
    const publishPackage = fake.resolves(undefined);
    const emitter = emitterFactory({ buildTarball, publishPackage });

    await emitter.publish({
        registrySettings: { token: 'the-token' },
        bundle: namedBundle()
    });

    assert.strictEqual(publishPackage.callCount, 1);
    assert.deepStrictEqual(publishPackage.firstCall.args, [
        { name: '', version: '' },
        emptyTarball,
        { token: 'the-token' }
    ]);
});
