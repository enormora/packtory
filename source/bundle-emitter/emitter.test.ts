import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake, type SinonSpy } from 'sinon';
import { Maybe } from 'true-myth';
import type { PublishSettings } from '../config/publish-settings.ts';
import { createTarballBuilder } from '../tar/tarball-builder.ts';
import { versionedBundleWithManifest } from '../test-libraries/bundle-fixtures.ts';
import { buildSbomFixtureContent } from '../test-libraries/sbom-fixtures.ts';
import { emptyTarball, tarballWithOneFile } from '../test-libraries/tarball-fixtures.ts';
import { createBundleEmitter, type BundleEmitterDependencies, type BundleEmitter } from './emitter.ts';

const registrySettings = { auth: { type: 'bearer-token', token: 'the-token' } } as const;

function namedBundle(): ReturnType<typeof versionedBundleWithManifest> {
    return versionedBundleWithManifest({ name: 'the-name' });
}

type Overrides = {
    readonly buildTarball?: SinonSpy;
    readonly publishPackage?: SinonSpy;
    readonly fetchLatestVersion?: SinonSpy;
    readonly collectContents?: SinonSpy;
    readonly fetchTarball?: SinonSpy;
    readonly ciRepositoryUrl?: string | undefined;
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
            buildFolder: fake(),
            buildZip: fake()
        },
        registryClient: {
            publishPackage: createSpy(overrides.publishPackage, fake),
            fetchLatestVersion: createSpy(overrides.fetchLatestVersion, fake),
            fetchTarball: createSpy(overrides.fetchTarball, () => {
                return fake.resolves(emptyTarball);
            })
        },
        ciRepositoryUrl: overrides.ciRepositoryUrl
    };

    return createBundleEmitter(dependencies);
}

function createPublishedBundleScenario(): {
    readonly emitter: BundleEmitter;
    readonly collectContents: SinonSpy;
    readonly fetchTarball: SinonSpy;
} {
    const fetchLatestVersion = fake.resolves(
        Maybe.just({ version: '1.2.3', tarballUrl: 'https://registry.example.test/package.tgz' })
    );
    const fetchTarball = fake.resolves(tarballWithOneFile);
    const collectContents = fake.returns([]);
    return {
        emitter: emitterFactory({ fetchLatestVersion, fetchTarball, collectContents }),
        collectContents,
        fetchTarball
    };
}

async function runSbomComparison(previousSbom: string, currentSbom: string): Promise<boolean> {
    const previousTarball = await createTarballBuilder().build([
        { filePath: 'sbom.cdx.json', content: previousSbom, isExecutable: false }
    ]);
    const fetchLatestVersion = fake.resolves(
        Maybe.just({ version: '1.2.3', tarballUrl: 'https://registry.example.test/package.tgz' })
    );
    const fetchTarball = fake.resolves(previousTarball);
    const collectContents = fake.returns([{ filePath: 'sbom.cdx.json', content: currentSbom, isExecutable: false }]);
    const emitter = emitterFactory({ fetchLatestVersion, fetchTarball, collectContents });
    const result = await emitter.checkBundleAlreadyPublished({ registrySettings, bundle: namedBundle() });
    return result.alreadyPublishedAsLatest;
}

suite('emitter', function () {
    test('determineCurrentVersion() fetches the latest version when automatic versioning is enabled', async function () {
        const fetchLatestVersion = fake.resolves(Maybe.nothing());
        const emitter = emitterFactory({ fetchLatestVersion });

        await emitter.determineCurrentVersion({
            name: 'the-name',
            registrySettings,
            versioning: { automatic: true }
        });

        assert.strictEqual(fetchLatestVersion.callCount, 1);
        assert.deepStrictEqual(fetchLatestVersion.firstCall.args, ['the-name', registrySettings]);
    });

    test('determineCurrentVersion() returns the fetched version when automatic versioning is enabled', async function () {
        const fetchLatestVersion = fake.resolves(Maybe.just({ version: 'the-version' }));
        const emitter = emitterFactory({ fetchLatestVersion });

        const result = await emitter.determineCurrentVersion({
            name: 'the-name',
            registrySettings,
            versioning: { automatic: true }
        });

        assert.deepStrictEqual(result, Maybe.just('the-version'));
    });

    test('determineCurrentVersion() doesn’t fetches the latest version when manual versioning is enabled', async function () {
        const fetchLatestVersion = fake.resolves(Maybe.nothing());
        const emitter = emitterFactory({ fetchLatestVersion });

        await emitter.determineCurrentVersion({
            name: 'the-name',
            registrySettings,
            versioning: { automatic: false, version: '' }
        });

        assert.strictEqual(fetchLatestVersion.callCount, 0);
    });

    test('determineCurrentVersion() returns the given version when manual versioning is enabled', async function () {
        const emitter = emitterFactory({});

        const result = await emitter.determineCurrentVersion({
            name: 'the-name',
            registrySettings,
            versioning: { automatic: false, version: 'manual-version' }
        });

        assert.deepStrictEqual(result, Maybe.just('manual-version'));
    });

    test('checkBundleAlreadyPublished() fetches the latest version', async function () {
        const fetchLatestVersion = fake.resolves(Maybe.nothing());
        const emitter = emitterFactory({ fetchLatestVersion });

        await emitter.checkBundleAlreadyPublished({
            registrySettings,
            bundle: namedBundle()
        });

        assert.strictEqual(fetchLatestVersion.callCount, 1);
        assert.deepStrictEqual(fetchLatestVersion.firstCall.args, ['the-name', registrySettings]);
    });

    test('checkBundleAlreadyPublished() returns false and Nothing when there is no latest version in the registry', async function () {
        const fetchLatestVersion = fake.resolves(Maybe.nothing());
        const collectContents = fake.returns([]);
        const emitter = emitterFactory({ fetchLatestVersion, collectContents });

        const result = await emitter.checkBundleAlreadyPublished({
            registrySettings,
            bundle: namedBundle()
        });

        assert.strictEqual(result.alreadyPublishedAsLatest, false);
        assert.strictEqual(result.previousReleaseArtifacts.isNothing, true);
        assert.strictEqual(collectContents.callCount, 0);
    });

    test('checkBundleAlreadyPublished() returns false and the fetched artifacts when the contents differ', async function () {
        const fetchLatestVersion = fake.resolves(
            Maybe.just({ version: '1.2.3', tarballUrl: 'https://registry.example.test/package.tgz' })
        );
        const fetchTarball = fake.resolves(tarballWithOneFile);
        const collectContents = fake.returns([]);
        const emitter = emitterFactory({ fetchLatestVersion, fetchTarball, collectContents });

        const bundle = namedBundle();
        const result = await emitter.checkBundleAlreadyPublished({
            registrySettings,
            bundle
        });

        assert.strictEqual(result.alreadyPublishedAsLatest, false);
        if (result.previousReleaseArtifacts.isNothing) {
            assert.fail('expected previousReleaseArtifacts to be present');
        }
        assert.strictEqual(result.previousReleaseArtifacts.value.version, '1.2.3');
        assert.strictEqual(result.previousReleaseArtifacts.value.files.length, 1);
        assert.deepStrictEqual(collectContents.firstCall.args, [bundle, 'package', undefined]);
        assert.deepStrictEqual(fetchTarball.firstCall.args, [
            'https://registry.example.test/package.tgz',
            registrySettings
        ]);
    });

    test('checkBundleAlreadyPublished() forwards extra files to collectContents', async function () {
        const checkScenario = createPublishedBundleScenario();
        const bundle = namedBundle();
        const extraFile = { filePath: 'sbom.cdx.json', content: '{}', isExecutable: false };
        await checkScenario.emitter.checkBundleAlreadyPublished({
            registrySettings,
            bundle,
            extraFiles: [extraFile]
        });

        assert.deepStrictEqual(checkScenario.collectContents.firstCall.args, [bundle, 'package', [extraFile]]);
    });

    test('checkBundleAlreadyPublished() returns true and the fetched artifacts when the latest version contents match', async function () {
        const fetchLatestVersion = fake.resolves(
            Maybe.just({ version: '1.2.3', tarballUrl: 'https://registry.example.test/package.tgz' })
        );
        const fetchTarball = fake.resolves(emptyTarball);
        const collectContents = fake.returns([]);
        const emitter = emitterFactory({ fetchLatestVersion, fetchTarball, collectContents });

        const result = await emitter.checkBundleAlreadyPublished({
            registrySettings,
            bundle: namedBundle()
        });

        assert.strictEqual(result.alreadyPublishedAsLatest, true);
        if (result.previousReleaseArtifacts.isNothing) {
            assert.fail('expected previousReleaseArtifacts to be present');
        }
        assert.strictEqual(result.previousReleaseArtifacts.value.version, '1.2.3');
        assert.deepStrictEqual(collectContents.firstCall.args[1], 'package');
        assert.deepStrictEqual(fetchTarball.firstCall.args, [
            'https://registry.example.test/package.tgz',
            registrySettings
        ]);
    });

    test('checkBundleAlreadyPublished() treats SBOMs as equal when only the packtory tool version differs', async function () {
        const previousSbom = buildSbomFixtureContent({ packtoryVersion: '1.2.3' });
        const currentSbom = buildSbomFixtureContent({ packtoryVersion: '9.9.9' });
        assert.strictEqual(await runSbomComparison(previousSbom, currentSbom), true);
    });

    test('checkBundleAlreadyPublished() still detects SBOM changes beyond the packtory tool version', async function () {
        const previousSbom = buildSbomFixtureContent({
            packtoryVersion: '1.2.3',
            dependencyComponents: [{ name: 'old-dependency', version: '1.0.0' }]
        });
        const currentSbom = buildSbomFixtureContent({
            packtoryVersion: '9.9.9',
            dependencyComponents: [{ name: 'new-dependency', version: '2.0.0' }]
        });
        assert.strictEqual(await runSbomComparison(previousSbom, currentSbom), false);
    });

    test('publish() publishes the given bundle', async function () {
        const buildTarball = fake.resolves({ tarData: emptyTarball });
        const publishPackage = fake.resolves(undefined);
        const emitter = emitterFactory({ buildTarball, publishPackage });
        const publishSettings = { access: 'public' } as const;

        await emitter.publish({
            registrySettings,
            bundle: namedBundle(),
            publishSettings
        });

        assert.strictEqual(publishPackage.callCount, 1);
        assert.deepStrictEqual(publishPackage.firstCall.args, [
            { name: '', version: '' },
            emptyTarball,
            registrySettings,
            publishSettings
        ]);
    });

    test('publish() forwards extra files to buildTarball', async function () {
        const buildTarball = fake.resolves({ tarData: emptyTarball });
        const emitter = emitterFactory({ buildTarball });
        const bundle = namedBundle();
        const extraFile = { filePath: 'sbom.cdx.json', content: '{}', isExecutable: false };

        await emitter.publish({
            registrySettings,
            bundle,
            publishSettings: { access: 'public' },
            extraFiles: [extraFile]
        });

        assert.deepStrictEqual(buildTarball.firstCall.args, [bundle, [extraFile]]);
    });

    function bundleWithRepository(repository: string | undefined): ReturnType<typeof versionedBundleWithManifest> {
        const packageJson = repository === undefined ? { name: 'the-name' } : { name: 'the-name', repository };
        return versionedBundleWithManifest({ packageJson });
    }

    test('publish() rejects under provenance auto mode when the manifest repository differs from the CI repository', async function () {
        const buildTarball = fake.resolves({ tarData: emptyTarball });
        const publishPackage = fake.resolves(undefined);
        const emitter = emitterFactory({
            buildTarball,
            publishPackage,
            ciRepositoryUrl: 'https://github.com/upstream/package'
        });

        try {
            await emitter.publish({
                registrySettings,
                bundle: bundleWithRepository('https://github.com/foo/forked-package'),
                publishSettings: { access: 'public', provenance: { type: 'auto' } }
            });
        } catch (error) {
            assert.ok(error instanceof Error);
            assert.match(error.message, /repository URL does not match/u);
            assert.strictEqual(buildTarball.callCount, 0);
            assert.strictEqual(publishPackage.callCount, 0);
            return;
        }
        assert.fail('Expected publish() to throw');
    });

    test('publish() does not run the coherence check under provenance file mode', async function () {
        const buildTarball = fake.resolves({ tarData: emptyTarball });
        const publishPackage = fake.resolves(undefined);
        const emitter = emitterFactory({
            buildTarball,
            publishPackage,
            ciRepositoryUrl: 'https://github.com/upstream/package'
        });

        await emitter.publish({
            registrySettings,
            bundle: bundleWithRepository('https://github.com/foo/forked-package'),
            publishSettings: { access: 'public', provenance: { type: 'file', path: '/build/bundle.sigstore' } }
        });

        assert.strictEqual(buildTarball.callCount, 1);
        assert.strictEqual(publishPackage.callCount, 1);
    });

    test('publish() does not run the coherence check when provenance is unset', async function () {
        const buildTarball = fake.resolves({ tarData: emptyTarball });
        const publishPackage = fake.resolves(undefined);
        const emitter = emitterFactory({
            buildTarball,
            publishPackage,
            ciRepositoryUrl: undefined
        });

        await emitter.publish({
            registrySettings,
            bundle: bundleWithRepository(undefined),
            publishSettings: { access: 'public' }
        });

        assert.strictEqual(buildTarball.callCount, 1);
        assert.strictEqual(publishPackage.callCount, 1);
    });

    test('publish() does not run the coherence check when access is restricted even if provenance is set to auto', async function () {
        const buildTarball = fake.resolves({ tarData: emptyTarball });
        const publishPackage = fake.resolves(undefined);
        const emitter = emitterFactory({
            buildTarball,
            publishPackage,
            ciRepositoryUrl: 'https://github.com/upstream/package'
        });

        await emitter.publish({
            registrySettings,
            bundle: bundleWithRepository('https://github.com/foo/forked-package'),
            publishSettings: { access: 'restricted', provenance: { type: 'auto' } } as unknown as PublishSettings
        });

        assert.strictEqual(buildTarball.callCount, 1);
        assert.strictEqual(publishPackage.callCount, 1);
    });
});
