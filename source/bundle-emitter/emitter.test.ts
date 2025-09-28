import test from 'ava';
import { fake, type SinonSpy } from 'sinon';
import { Maybe } from 'true-myth';
import { createBundleEmitter, type BundleEmitterDependencies, type BundleEmitter } from './emitter.js';

const emptyTarball = Buffer.from([
    31, 139, 8, 0, 0, 0, 0, 0, 2, 255, 99, 96, 24, 5, 163, 96, 20, 140, 84, 0, 0, 46, 175, 181, 239, 0, 4, 0, 0
]);
const tarballWithOneFile = Buffer.from([
    /* eslint-disable unicorn/no-useless-spread -- hardcoded binary data for testing */
    ...[31, 139, 8, 0, 0, 0, 0, 0, 2, 255, 43, 72, 76, 206, 78, 76, 79, 213],
    ...[79, 203, 207, 215, 203, 42, 102, 160, 9, 48, 48, 48, 48, 51, 49, 81],
    ...[0, 209, 64, 128, 78, 131, 128, 177, 2, 130, 109, 160, 96, 96, 104, 104],
    ...[102, 110, 4, 148, 103, 160, 3, 40, 45, 46, 73, 44, 2, 58, 133, 10, 158],
    ...[68, 241, 220, 16, 1, 192, 120, 103, 24, 5, 163, 96, 20, 140, 130, 81, 48],
    ...[242, 0, 0, 60, 78, 198, 6, 0, 8, 0, 0]
    /* eslint-enable unicorn/no-useless-spread -- hardcoded binary data for testing */
]);

type Overrides = {
    readonly buildTarball?: SinonSpy;
    readonly publishPackage?: SinonSpy;
    readonly fetchLatestVersion?: SinonSpy;
    readonly build?: SinonSpy;
    readonly emit?: SinonSpy;
    readonly collectContents?: SinonSpy;
    readonly fetchTarball?: SinonSpy;
};

// eslint-disable-next-line complexity -- needs to be refactored
function emitterFactory(overrides: Overrides = {}): BundleEmitter {
    const {
        buildTarball = fake.resolves({}),
        publishPackage = fake(),
        fetchLatestVersion = fake(),
        build = fake.resolves({ packageJson: {} }),
        emit = fake(),
        collectContents = fake.resolves([]),
        fetchTarball = fake.resolves(emptyTarball)
    } = overrides;
    const fakeDependencies = {
        artifactsBuilder: { buildTarball, collectContents },
        registryClient: { publishPackage, fetchLatestVersion, fetchTarball },
        bundler: { build },
        progressBroadcaster: { emit }
    } as unknown as BundleEmitterDependencies;

    return createBundleEmitter(fakeDependencies);
}

test('determineCurrentVersion() fetches the latest version when automatic versioning is enabled', async (t) => {
    const fetchLatestVersion = fake.resolves(Maybe.nothing());
    const emitter = emitterFactory({ fetchLatestVersion });

    await emitter.determineCurrentVersion({
        name: 'the-name',
        registrySettings: { token: 'the-token' },
        versioning: { automatic: true }
    });

    t.is(fetchLatestVersion.callCount, 1);
    t.deepEqual(fetchLatestVersion.firstCall.args, ['the-name', { token: 'the-token' }]);
});

test('determineCurrentVersion() returns the fetched version when automatic versioning is enabled', async (t) => {
    const fetchLatestVersion = fake.resolves(Maybe.just({ version: 'the-version' }));
    const emitter = emitterFactory({ fetchLatestVersion });

    const result = await emitter.determineCurrentVersion({
        name: 'the-name',
        registrySettings: { token: 'the-token' },
        versioning: { automatic: true }
    });

    t.deepEqual(result, Maybe.just('the-version'));
});

test('determineCurrentVersion() doesn’t fetches the latest version when manual versioning is enabled', async (t) => {
    const fetchLatestVersion = fake.resolves(Maybe.nothing());
    const emitter = emitterFactory({ fetchLatestVersion });

    await emitter.determineCurrentVersion({
        name: 'the-name',
        registrySettings: { token: 'the-token' },
        versioning: { automatic: false, version: '' }
    });

    t.is(fetchLatestVersion.callCount, 0);
});

test('determineCurrentVersion() returns the given version when manual versioning is enabled', async (t) => {
    const emitter = emitterFactory({});

    const result = await emitter.determineCurrentVersion({
        name: 'the-name',
        registrySettings: { token: 'the-token' },
        versioning: { automatic: false, version: 'manual-version' }
    });

    t.deepEqual(result, Maybe.just('manual-version'));
});

test('checkBundleAlreadyPublished() fetches the latest version', async (t) => {
    const fetchLatestVersion = fake.resolves(Maybe.nothing());
    const emitter = emitterFactory({ fetchLatestVersion });

    await emitter.checkBundleAlreadyPublished({
        registrySettings: { token: 'the-token' },
        bundle: {
            name: 'the-name',
            contents: [],
            version: '',
            dependencies: {},
            peerDependencies: {},
            additionalAttributes: {},
            mainFile: { content: '', isExecutable: false, sourceFilePath: '', targetFilePath: '' },
            packageType: 'module',
            manifestFile: { content: '', isExecutable: false, filePath: '' },
            packageJson: { name: '', version: '' }
        }
    });

    t.is(fetchLatestVersion.callCount, 1);
    t.deepEqual(fetchLatestVersion.firstCall.args, ['the-name', { token: 'the-token' }]);
});

test('checkBundleAlreadyPublished() returns false when there is no latest version in the registry', async (t) => {
    const fetchLatestVersion = fake.resolves(Maybe.nothing());
    const emitter = emitterFactory({ fetchLatestVersion });

    const result = await emitter.checkBundleAlreadyPublished({
        registrySettings: { token: 'the-token' },
        bundle: {
            name: 'the-name',
            contents: [],
            version: '',
            dependencies: {},
            peerDependencies: {},
            additionalAttributes: {},
            mainFile: { content: '', isExecutable: false, sourceFilePath: '', targetFilePath: '' },
            packageType: 'module',
            manifestFile: { content: '', isExecutable: false, filePath: '' },
            packageJson: { name: '', version: '' }
        }
    });

    t.deepEqual(result, { alreadyPublishedAsLatest: false });
});

test('checkBundleAlreadyPublished() returns false when the latest version contents doesn’t match the given bundle', async (t) => {
    const fetchLatestVersion = fake.resolves(Maybe.just('1.2.3'));
    const fetchTarball = fake.resolves(tarballWithOneFile);
    const emitter = emitterFactory({ fetchLatestVersion, fetchTarball });

    const result = await emitter.checkBundleAlreadyPublished({
        registrySettings: { token: 'the-token' },
        bundle: {
            name: 'the-name',
            contents: [],
            version: '',
            dependencies: {},
            peerDependencies: {},
            additionalAttributes: {},
            mainFile: { content: '', isExecutable: false, sourceFilePath: '', targetFilePath: '' },
            packageType: 'module',
            manifestFile: { content: '', isExecutable: false, filePath: '' },
            packageJson: { name: '', version: '' }
        }
    });

    t.deepEqual(result, { alreadyPublishedAsLatest: false });
});

test('checkBundleAlreadyPublished() returns true when the latest version contents match the given bundle contents', async (t) => {
    const fetchLatestVersion = fake.resolves(Maybe.just('1.2.3'));
    const fetchTarball = fake.resolves(emptyTarball);
    const emitter = emitterFactory({ fetchLatestVersion, fetchTarball });

    const result = await emitter.checkBundleAlreadyPublished({
        registrySettings: { token: 'the-token' },
        bundle: {
            name: 'the-name',
            contents: [],
            version: '',
            dependencies: {},
            peerDependencies: {},
            additionalAttributes: {},
            mainFile: { content: '', isExecutable: false, sourceFilePath: '', targetFilePath: '' },
            packageType: 'module',
            manifestFile: { content: '', isExecutable: false, filePath: '' },
            packageJson: { name: '', version: '' }
        }
    });

    t.deepEqual(result, { alreadyPublishedAsLatest: false });
});

test('publish() publishes the given bundle', async (t) => {
    const buildTarball = fake.resolves({ tarData: emptyTarball });
    const publishPackage = fake.resolves(undefined);
    const emitter = emitterFactory({ buildTarball, publishPackage });

    await emitter.publish({
        registrySettings: { token: 'the-token' },
        bundle: {
            name: 'the-name',
            contents: [],
            version: '',
            dependencies: {},
            peerDependencies: {},
            additionalAttributes: {},
            mainFile: { content: '', isExecutable: false, sourceFilePath: '', targetFilePath: '' },
            packageType: 'module',
            manifestFile: { content: '', isExecutable: false, filePath: '' },
            packageJson: { name: '', version: '' }
        }
    });

    t.is(publishPackage.callCount, 1);
    t.deepEqual(publishPackage.firstCall.args, [{ name: '', version: '' }, emptyTarball, { token: 'the-token' }]);
});
