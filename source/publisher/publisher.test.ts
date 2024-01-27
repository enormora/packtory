import test from 'ava';
import { fake, type SinonSpy } from 'sinon';
import { Maybe } from 'true-myth';
import { createPublisher, type PublisherDependencies, type Publisher } from './publisher.js';

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

function publisherFactory(overrides: Overrides = {}): Publisher {
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
    } as unknown as PublisherDependencies;

    return createPublisher(fakeDependencies);
}

test('buildAndPublish() fetches the latest version', async (t) => {
    const fetchLatestVersion = fake.resolves(Maybe.nothing());
    const publisher = publisherFactory({ fetchLatestVersion });

    await publisher.buildAndPublish({
        name: 'the-name',
        sourcesFolder: '',
        entryPoints: [{ js: '' }],
        registrySettings: { token: 'the-token' },
        mainPackageJson: {}
    });

    t.is(fetchLatestVersion.callCount, 1);
    t.deepEqual(fetchLatestVersion.firstCall.args, ['the-name', { token: 'the-token' }]);
});

test('buildAndPublish() builds and publishes the initial version when there is no version published yet', async (t) => {
    const publishPackage = fake.resolves(undefined);
    const build = fake.resolves({ contents: [], packageJson: { version: '42' } });
    const tarData = Buffer.from([1, 2, 3, 4]);
    const fetchLatestVersion = fake.resolves(Maybe.nothing());
    const publisher = publisherFactory({
        fetchLatestVersion,
        publishPackage,
        build,
        buildTarball: fake.resolves({ tarData })
    });

    await publisher.buildAndPublish({
        name: 'the-name',
        sourcesFolder: 'the-folder',
        entryPoints: [{ js: 'the-entry-point' }],
        registrySettings: { token: 'the-token' },
        mainPackageJson: {}
    });

    t.is(build.callCount, 1);
    t.deepEqual(build.firstCall.args, [
        {
            entryPoints: [{ js: 'the-entry-point' }],
            mainPackageJson: {},
            name: 'the-name',
            sourcesFolder: 'the-folder',
            version: '0.0.1'
        }
    ]);
    t.is(publishPackage.callCount, 1);
    t.deepEqual(publishPackage.firstCall.args, [{ version: '42' }, tarData, { token: 'the-token' }]);
});

test('buildAndPublish() builds and publishes the initial version using the given minimum version number', async (t) => {
    const publishPackage = fake.resolves(undefined);
    const build = fake.resolves({ contents: [], packageJson: { version: '42' } });
    const tarData = Buffer.from([1, 2, 3, 4]);
    const fetchLatestVersion = fake.resolves(Maybe.nothing());
    const publisher = publisherFactory({
        fetchLatestVersion,
        publishPackage,
        build,
        buildTarball: fake.resolves({ tarData })
    });

    await publisher.buildAndPublish({
        name: 'the-name',
        versioning: { automatic: true, minimumVersion: '1.2.3' },
        sourcesFolder: 'the-folder',
        entryPoints: [{ js: 'the-entry-point' }],
        registrySettings: { token: 'the-token' },
        mainPackageJson: {}
    });

    t.is(build.callCount, 1);
    t.deepEqual(build.firstCall.args, [
        {
            entryPoints: [{ js: 'the-entry-point' }],
            mainPackageJson: {},
            name: 'the-name',
            sourcesFolder: 'the-folder',
            version: '1.2.3'
        }
    ]);
    t.is(publishPackage.callCount, 1);
    t.deepEqual(publishPackage.firstCall.args, [{ version: '42' }, tarData, { token: 'the-token' }]);
});

test('buildAndPublish() returns the correct result after publishing the initial version', async (t) => {
    const fetchLatestVersion = fake.resolves(Maybe.nothing());
    const build = fake.resolves({ contents: [], packageJson: { version: '42' } });
    const publisher = publisherFactory({ fetchLatestVersion, build });

    const result = await publisher.buildAndPublish({
        name: '',
        sourcesFolder: '',
        entryPoints: [{ js: '' }],
        registrySettings: { token: '' },
        mainPackageJson: {}
    });

    t.deepEqual(result, {
        status: 'initial-version',
        bundle: { contents: [], packageJson: { version: '42' } }
    });
});

test('buildAndPublish() emits progress events before building the initial version', async (t) => {
    const fetchLatestVersion = fake.resolves(Maybe.nothing());
    const emit = fake();
    const build = fake.resolves({ contents: [], packageJson: { name: 'the-name', version: '42' } });
    const publisher = publisherFactory({ fetchLatestVersion, emit, build });

    await publisher.buildAndPublish({
        name: 'the-name',
        sourcesFolder: '',
        entryPoints: [{ js: '' }],
        registrySettings: { token: '' },
        mainPackageJson: {}
    });

    t.is(emit.callCount, 2);
    t.deepEqual(emit.firstCall.args, ['building', { packageName: 'the-name', version: '0.0.1' }]);
    t.deepEqual(emit.secondCall.args, ['publishing', { packageName: 'the-name', version: '42' }]);
});

test('buildAndPublish() builds and publishes a new version incrementing the latest version by one', async (t) => {
    const publishPackage = fake.resolves(undefined);
    const build = fake.resolves({ contents: [], packageJson: { version: '42' } });
    const tarData = Buffer.from([1, 2, 3, 4]);
    const buildTarball = fake.resolves({ tarData, shasum: 'abc' });
    const publisher = publisherFactory({
        fetchLatestVersion: fake.resolves(Maybe.just({ version: '1.2.3', shasum: 'xyz' })),
        publishPackage,
        build,
        buildTarball,
        fetchTarball: fake.resolves(tarballWithOneFile)
    });

    await publisher.buildAndPublish({
        name: 'the-name',
        sourcesFolder: 'the-folder',
        entryPoints: [{ js: 'the-entry-point' }],
        registrySettings: { token: 'the-token' },
        mainPackageJson: {}
    });

    t.deepEqual(build.args, [
        [
            {
                entryPoints: [{ js: 'the-entry-point' }],
                mainPackageJson: {},
                name: 'the-name',
                sourcesFolder: 'the-folder',
                version: '1.2.3'
            }
        ]
    ]);
    t.is(buildTarball.callCount, 1);
    t.is(publishPackage.callCount, 1);
    t.deepEqual(publishPackage.firstCall.args, [{ version: '1.2.4' }, tarData, { token: 'the-token' }]);
});

test('buildAndPublish() emits a progress event before building a new version', async (t) => {
    const fetchTarball = fake.resolves(tarballWithOneFile);
    const fetchLatestVersion = fake.resolves(Maybe.just({ version: '1.2.3', shasum: 'xyz' }));
    const emit = fake();
    const build = fake.resolves({ contents: [], packageJson: { name: 'the-name', version: '42' } });
    const publisher = publisherFactory({ fetchLatestVersion, emit, build, fetchTarball });

    await publisher.buildAndPublish({
        name: 'the-name',
        sourcesFolder: '',
        entryPoints: [{ js: '' }],
        registrySettings: { token: '' },
        mainPackageJson: {}
    });

    t.is(emit.callCount, 3);
    t.deepEqual(emit.firstCall.args, ['building', { packageName: 'the-name', version: '1.2.3' }]);
    t.deepEqual(emit.secondCall.args, ['rebuilding', { packageName: 'the-name', version: '1.2.4' }]);
    t.deepEqual(emit.thirdCall.args, ['publishing', { packageName: 'the-name', version: '1.2.4' }]);
});

test('buildAndPublish() doesn’t publish any version when the shasum of the built bundle is the same as the shasum of the latest published version', async (t) => {
    const publishPackage = fake.resolves(undefined);
    const build = fake.resolves({ contents: [], packageJson: { version: '42' } });
    const tarData = Buffer.from([1, 2, 3, 4]);
    const buildTarball = fake.resolves({ tarData, shasum: 'abc' });
    const fetchLatestVersion = fake.resolves(Maybe.just({ version: '1.2.3', shasum: 'abc' }));
    const publisher = publisherFactory({ fetchLatestVersion, publishPackage, build, buildTarball });

    await publisher.buildAndPublish({
        name: '',
        sourcesFolder: '',
        entryPoints: [{ js: '' }],
        registrySettings: { token: '' },
        mainPackageJson: {}
    });

    t.is(build.callCount, 1);
    t.is(publishPackage.callCount, 0);
});

test('buildAndPublish() returns the correct result after publishing a new version', async (t) => {
    const fetchTarball = fake.resolves(tarballWithOneFile);
    const fetchLatestVersion = fake.resolves(Maybe.just({ version: '1.2.3', shasum: 'abc' }));
    const build = fake.resolves({ contents: [], packageJson: { version: '42' } });
    const buildTarball = fake.resolves({ shasum: 'xyz' });
    const publisher = publisherFactory({ fetchLatestVersion, build, buildTarball, fetchTarball });

    const result = await publisher.buildAndPublish({
        name: '',
        sourcesFolder: '',
        entryPoints: [{ js: '' }],
        registrySettings: { token: '' },
        mainPackageJson: {}
    });

    t.deepEqual(result, {
        status: 'new-version',
        bundle: {
            contents: [{ kind: 'source', source: '{\n    "version": "1.2.4"\n}', targetFilePath: 'package.json' }],
            packageJson: { version: '1.2.4' }
        }
    });
});

test('buildAndPublish() throws an error when publishing with manual versioning and the given version is the same as the latest version', async (t) => {
    const fetchLatestVersion = fake.resolves(Maybe.just({ version: '1.2.3' }));
    const publisher = publisherFactory({ fetchLatestVersion });

    try {
        await publisher.buildAndPublish({
            name: 'the-name',
            versioning: { automatic: false, version: '1.2.3' },
            sourcesFolder: '',
            entryPoints: [{ js: '' }],
            registrySettings: { token: '' },
            mainPackageJson: {}
        });
        t.fail('Expected buildAndPublish() to throw but it did not');
    } catch (error: unknown) {
        t.is((error as Error).message, 'Version 1.2.3 of package the-name is already published');
    }
});

test('buildAndPublish() builds and publish a new version using manual versioning', async (t) => {
    const publishPackage = fake.resolves(undefined);
    const build = fake.resolves({ contents: [], packageJson: { version: '42' } });
    const tarData = Buffer.from([1, 2, 3, 4]);
    const buildTarball = fake.resolves({ tarData });
    const publisher = publisherFactory({
        fetchLatestVersion: fake.resolves(Maybe.nothing()),
        publishPackage,
        build,
        buildTarball
    });

    await publisher.buildAndPublish({
        name: '',
        versioning: { automatic: false, version: '1.2.3' },
        sourcesFolder: '',
        entryPoints: [{ js: '' }],
        registrySettings: { token: 'the-token' },
        mainPackageJson: {}
    });

    t.is(build.callCount, 1);
    t.deepEqual(build.firstCall.args, [
        { name: '', version: '1.2.3', sourcesFolder: '', entryPoints: [{ js: '' }], mainPackageJson: {} }
    ]);
    t.is(publishPackage.callCount, 1);
    t.deepEqual(publishPackage.firstCall.args, [{ version: '42' }, tarData, { token: 'the-token' }]);
});

test('buildAndPublish() emits progress events before building a manually defined version', async (t) => {
    const fetchLatestVersion = fake.resolves(Maybe.nothing());
    const emit = fake();
    const build = fake.resolves({ contents: [], packageJson: { name: 'the-name', version: '42' } });
    const publisher = publisherFactory({ fetchLatestVersion, emit, build });

    await publisher.buildAndPublish({
        name: 'the-name',
        versioning: { automatic: false, version: '1.2.3' },
        sourcesFolder: '',
        entryPoints: [{ js: '' }],
        registrySettings: { token: '' },
        mainPackageJson: {}
    });

    t.is(emit.callCount, 2);
    t.deepEqual(emit.firstCall.args, ['building', { packageName: 'the-name', version: '1.2.3' }]);
    t.deepEqual(emit.secondCall.args, ['publishing', { packageName: 'the-name', version: '42' }]);
});

test('buildAndPublish() returns the correct result after publishing a new version using manual versioning', async (t) => {
    const fetchLatestVersion = fake.resolves(Maybe.nothing());
    const build = fake.resolves({ contents: [], packageJson: { version: '42' } });
    const buildTarball = fake.resolves({});
    const publisher = publisherFactory({ fetchLatestVersion, build, buildTarball });

    const result = await publisher.buildAndPublish({
        name: '',
        versioning: { automatic: false, version: '1.2.3' },
        sourcesFolder: '',
        entryPoints: [{ js: '' }],
        registrySettings: { token: '' },
        mainPackageJson: {}
    });

    t.deepEqual(result, {
        status: 'new-version',
        bundle: { contents: [], packageJson: { version: '42' } }
    });
});
