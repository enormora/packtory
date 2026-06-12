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
const publishedOutcome = { type: 'published' } as const;
const publishedAt = new Date('2026-05-20T00:00:00.000Z');
const latestReleaseMetadata = {
    version: '1.2.3',
    tarballUrl: 'https://registry.example.test/package.tgz',
    publishedAt,
    gitHead: undefined
} as const;
type CurrentVersionRequest = Parameters<BundleEmitter['determineCurrentVersion']>[0];
type PublishRequest = Parameters<BundleEmitter['publish']>[0];

function namedBundle(): ReturnType<typeof versionedBundleWithManifest> {
    return versionedBundleWithManifest({ name: 'the-name' });
}

function bundleWithRepository(repository: string | undefined): ReturnType<typeof versionedBundleWithManifest> {
    const packageJson = repository === undefined ? { name: 'the-name' } : { name: 'the-name', repository };
    return versionedBundleWithManifest({ packageJson });
}

type Overrides = {
    readonly buildTarball?: SinonSpy;
    readonly publishPackage?: SinonSpy;
    readonly fetchLatestVersion?: SinonSpy;
    readonly fetchStagedVersions?: SinonSpy;
    readonly fetchLatestReleaseMetadata?: SinonSpy;
    readonly collectContents?: SinonSpy;
    readonly fetchTarball?: SinonSpy;
    readonly ciRepositoryUrl?: string | undefined;
    readonly readCurrentGitHead?: () => Promise<string | undefined>;
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
            fetchLatestReleaseMetadata: createSpy(overrides.fetchLatestReleaseMetadata, fake),
            fetchLatestVersion: createSpy(overrides.fetchLatestVersion, fake),
            fetchStagedVersions: createSpy(overrides.fetchStagedVersions, fake),
            fetchTarball: createSpy(overrides.fetchTarball, () => {
                return fake.resolves(emptyTarball);
            })
        },
        ciRepositoryUrl: overrides.ciRepositoryUrl,
        readCurrentGitHead: overrides.readCurrentGitHead ?? (async () => undefined)
    };

    return createBundleEmitter(dependencies);
}

function currentVersionRequest(params: {
    readonly stage: boolean;
    readonly versioning: CurrentVersionRequest['versioning'];
    readonly registrySettings?: CurrentVersionRequest['registrySettings'];
}): CurrentVersionRequest {
    return {
        name: 'the-name',
        registrySettings: params.registrySettings ?? registrySettings,
        stage: params.stage,
        versioning: params.versioning
    };
}

async function determineCurrentVersion(
    emitter: BundleEmitter,
    params: {
        readonly stage: boolean;
        readonly versioning: CurrentVersionRequest['versioning'];
        readonly registrySettings?: CurrentVersionRequest['registrySettings'];
    }
): Promise<Maybe<string>> {
    return emitter.determineCurrentVersion(currentVersionRequest(params));
}

async function expectCurrentVersionFailure(
    emitter: BundleEmitter,
    params: {
        readonly stage: boolean;
        readonly versioning: CurrentVersionRequest['versioning'];
        readonly registrySettings?: CurrentVersionRequest['registrySettings'];
    },
    matcher: RegExp
): Promise<void> {
    await assert.rejects(async () => {
        await determineCurrentVersion(emitter, params);
    }, matcher);
}

function publishRequest(params: {
    readonly bundle?: PublishRequest['bundle'];
    readonly publishSettings: PublishRequest['publishSettings'];
    readonly stage?: boolean;
    readonly extraFiles?: PublishRequest['extraFiles'];
}): PublishRequest {
    return {
        registrySettings,
        bundle: params.bundle ?? namedBundle(),
        publishSettings: params.publishSettings,
        stage: params.stage ?? false,
        ...(params.extraFiles === undefined ? {} : { extraFiles: params.extraFiles })
    };
}

async function publishBundle(
    emitter: BundleEmitter,
    params: {
        readonly bundle?: PublishRequest['bundle'];
        readonly publishSettings: PublishRequest['publishSettings'];
        readonly stage?: boolean;
        readonly extraFiles?: PublishRequest['extraFiles'];
    }
): Promise<void> {
    await emitter.publish(publishRequest(params));
}

function createPublishScenario(ciRepositoryUrl: string | undefined): {
    readonly buildTarball: SinonSpy;
    readonly publishPackage: SinonSpy;
    readonly emitter: BundleEmitter;
} {
    const buildTarball = fake.resolves({ tarData: emptyTarball });
    const publishPackage = fake.resolves(publishedOutcome);
    return {
        buildTarball,
        publishPackage,
        emitter: emitterFactory({ buildTarball, publishPackage, ciRepositoryUrl })
    };
}

function buildSbomWithDependency(params: {
    readonly packtoryVersion: string;
    readonly dependencyName: string;
    readonly dependencyVersion: string;
}): string {
    return buildSbomFixtureContent({
        packtoryVersion: params.packtoryVersion,
        dependencyComponents: [{ name: params.dependencyName, version: params.dependencyVersion }]
    });
}

function createPublishedBundleScenario(): {
    readonly emitter: BundleEmitter;
    readonly collectContents: SinonSpy;
    readonly fetchTarball: SinonSpy;
} {
    const fetchLatestReleaseMetadata = fake.resolves(Maybe.just(latestReleaseMetadata));
    const fetchTarball = fake.resolves(tarballWithOneFile);
    const collectContents = fake.returns([]);
    return {
        emitter: emitterFactory({ fetchLatestReleaseMetadata, fetchTarball, collectContents }),
        collectContents,
        fetchTarball
    };
}

async function runSbomComparison(previousSbom: string, currentSbom: string): Promise<boolean> {
    const previousTarball = await createTarballBuilder().build([
        { filePath: 'sbom.cdx.json', content: previousSbom, isExecutable: false }
    ]);
    const fetchLatestReleaseMetadata = fake.resolves(
        Maybe.just({
            version: latestReleaseMetadata.version,
            tarballUrl: latestReleaseMetadata.tarballUrl,
            publishedAt,
            gitHead: undefined
        })
    );
    const fetchTarball = fake.resolves(previousTarball);
    const collectContents = fake.returns([{ filePath: 'sbom.cdx.json', content: currentSbom, isExecutable: false }]);
    const emitter = emitterFactory({ fetchLatestReleaseMetadata, fetchTarball, collectContents });
    const result = await emitter.checkBundleAlreadyPublished({ registrySettings, bundle: namedBundle() });
    return result.alreadyPublishedAsLatest;
}

function assertPreviousReleaseArtifacts(
    value: {
        readonly version: string;
        readonly publishedAt?: Date | undefined;
        readonly files: readonly unknown[];
    },
    expectedFileCount?: number
): void {
    assert.strictEqual(value.version, latestReleaseMetadata.version);
    assert.deepStrictEqual(value.publishedAt, publishedAt);

    if (expectedFileCount !== undefined) {
        assert.strictEqual(value.files.length, expectedFileCount);
    }
}

suite('emitter', function () {
    test('determineCurrentVersion() fetches the latest version when automatic versioning is enabled', async function () {
        const fetchLatestVersion = fake.resolves(Maybe.nothing());
        const emitter = emitterFactory({ fetchLatestVersion });

        await determineCurrentVersion(emitter, { stage: false, versioning: { automatic: true } });

        assert.strictEqual(fetchLatestVersion.callCount, 1);
        assert.deepStrictEqual(fetchLatestVersion.firstCall.args, ['the-name', registrySettings]);
    });

    test('determineCurrentVersion() returns the fetched version when automatic versioning is enabled', async function () {
        const fetchLatestVersion = fake.resolves(Maybe.just({ version: 'the-version' }));
        const emitter = emitterFactory({ fetchLatestVersion });

        const result = await determineCurrentVersion(emitter, {
            stage: false,
            versioning: { automatic: true }
        });

        assert.deepStrictEqual(result, Maybe.just('the-version'));
    });

    test('determineCurrentVersion() doesn’t fetches the latest version when manual versioning is enabled', async function () {
        const fetchLatestVersion = fake.resolves(Maybe.nothing());
        const emitter = emitterFactory({ fetchLatestVersion });

        await determineCurrentVersion(emitter, {
            stage: false,
            versioning: { automatic: false, version: '' }
        });

        assert.strictEqual(fetchLatestVersion.callCount, 0);
    });

    test('determineCurrentVersion() returns the given version when manual versioning is enabled', async function () {
        const emitter = emitterFactory({});

        const result = await determineCurrentVersion(emitter, {
            stage: false,
            versioning: { automatic: false, version: 'manual-version' }
        });

        assert.deepStrictEqual(result, Maybe.just('manual-version'));
    });

    test('determineCurrentVersion() selects the highest staged version in stage mode', async function () {
        for (const stagedVersions of [
            ['1.2.4', '1.2.5'],
            ['1.2.5', '1.2.4']
        ] as const) {
            const fetchLatestVersion = fake.resolves(Maybe.just({ version: '1.2.3' }));
            const fetchStagedVersions = fake.resolves(stagedVersions);
            const emitter = emitterFactory({ fetchLatestVersion, fetchStagedVersions });

            const result = await determineCurrentVersion(emitter, {
                stage: true,
                versioning: { automatic: true }
            });

            assert.deepStrictEqual(result, Maybe.just('1.2.5'));
            assert.deepStrictEqual(fetchStagedVersions.firstCall.args, ['the-name', registrySettings]);
        }
    });

    test('determineCurrentVersion() returns the configured manual version in stage mode after validating package existence', async function () {
        const fetchLatestVersion = fake.resolves(Maybe.just({ version: '1.2.3' }));
        const fetchStagedVersions = fake.resolves(['1.2.4']);
        const emitter = emitterFactory({ fetchLatestVersion, fetchStagedVersions });

        const result = await determineCurrentVersion(emitter, {
            stage: true,
            versioning: { automatic: false, version: '9.9.9' }
        });

        assert.deepStrictEqual(result, Maybe.just('9.9.9'));
        assert.strictEqual(fetchStagedVersions.callCount, 0);
    });

    test('determineCurrentVersion() rejects an invalid staged version returned by the registry', async function () {
        const fetchLatestVersion = fake.resolves(Maybe.just({ version: '1.2.3' }));
        const fetchStagedVersions = fake.resolves(['not-semver']);
        const emitter = emitterFactory({ fetchLatestVersion, fetchStagedVersions });

        await expectCurrentVersionFailure(
            emitter,
            { stage: true, versioning: { automatic: true } },
            /invalid version "not-semver"/u
        );
    });

    test('determineCurrentVersion() rejects an invalid latest version returned by the registry in stage mode', async function () {
        const fetchLatestVersion = fake.resolves(Maybe.just({ version: undefined } as never));
        const fetchStagedVersions = fake.resolves([]);
        const emitter = emitterFactory({ fetchLatestVersion, fetchStagedVersions });

        await expectCurrentVersionFailure(
            emitter,
            { stage: true, versioning: { automatic: true } },
            /invalid version "undefined"/u
        );
    });

    test('determineCurrentVersion() rejects staged publishing for a first publish', async function () {
        const fetchLatestVersion = fake.resolves(Maybe.nothing());
        const emitter = emitterFactory({ fetchLatestVersion });

        await expectCurrentVersionFailure(
            emitter,
            { stage: true, versioning: { automatic: false, version: '1.0.0' } },
            /already exist on the npm registry/u
        );
    });

    test('determineCurrentVersion() rejects staged publishing for non-npm registries', async function () {
        const fetchLatestVersion = fake.resolves(Maybe.just({ version: '1.2.3' }));
        const emitter = emitterFactory({ fetchLatestVersion });

        await expectCurrentVersionFailure(
            emitter,
            {
                registrySettings: {
                    registryUrl: 'https://registry.example.test',
                    auth: { type: 'bearer-token', token: 'the-token' }
                },
                stage: true,
                versioning: { automatic: true }
            },
            /only supported with the npmjs.org registry/u
        );
        assert.strictEqual(fetchLatestVersion.callCount, 0);
    });

    test('checkBundleAlreadyPublished() fetches the latest release metadata', async function () {
        const fetchLatestReleaseMetadata = fake.resolves(Maybe.nothing());
        const emitter = emitterFactory({ fetchLatestReleaseMetadata });

        await emitter.checkBundleAlreadyPublished({
            registrySettings,
            bundle: namedBundle()
        });

        assert.strictEqual(fetchLatestReleaseMetadata.callCount, 1);
        assert.deepStrictEqual(fetchLatestReleaseMetadata.firstCall.args, ['the-name', registrySettings]);
    });

    test('checkBundleAlreadyPublished() returns false and Nothing when there is no latest version in the registry', async function () {
        const fetchLatestReleaseMetadata = fake.resolves(Maybe.nothing());
        const collectContents = fake.returns([]);
        const emitter = emitterFactory({ fetchLatestReleaseMetadata, collectContents });

        const result = await emitter.checkBundleAlreadyPublished({
            registrySettings,
            bundle: namedBundle()
        });

        assert.strictEqual(result.alreadyPublishedAsLatest, false);
        assert.strictEqual(result.previousReleaseArtifacts.isNothing, true);
        assert.strictEqual(collectContents.callCount, 0);
    });

    test('checkBundleAlreadyPublished() returns false and the fetched artifacts when the contents differ', async function () {
        const fetchLatestReleaseMetadata = fake.resolves(Maybe.just(latestReleaseMetadata));
        const fetchTarball = fake.resolves(tarballWithOneFile);
        const collectContents = fake.returns([]);
        const emitter = emitterFactory({ fetchLatestReleaseMetadata, fetchTarball, collectContents });

        const bundle = namedBundle();
        const result = await emitter.checkBundleAlreadyPublished({
            registrySettings,
            bundle
        });

        assert.strictEqual(result.alreadyPublishedAsLatest, false);
        if (result.previousReleaseArtifacts.isNothing) {
            assert.fail('expected previousReleaseArtifacts to be present');
        }
        assertPreviousReleaseArtifacts(result.previousReleaseArtifacts.value, 1);
        assert.deepStrictEqual(collectContents.firstCall.args, [bundle, 'package', undefined]);
        assert.deepStrictEqual(fetchTarball.firstCall.args, [latestReleaseMetadata.tarballUrl, registrySettings]);
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
        const fetchLatestReleaseMetadata = fake.resolves(Maybe.just(latestReleaseMetadata));
        const fetchTarball = fake.resolves(emptyTarball);
        const collectContents = fake.returns([]);
        const emitter = emitterFactory({ fetchLatestReleaseMetadata, fetchTarball, collectContents });

        const result = await emitter.checkBundleAlreadyPublished({
            registrySettings,
            bundle: namedBundle()
        });

        assert.strictEqual(result.alreadyPublishedAsLatest, true);
        if (result.previousReleaseArtifacts.isNothing) {
            assert.fail('expected previousReleaseArtifacts to be present');
        }
        assertPreviousReleaseArtifacts(result.previousReleaseArtifacts.value);
        assert.deepStrictEqual(collectContents.firstCall.args[1], 'package');
        assert.deepStrictEqual(fetchTarball.firstCall.args, [latestReleaseMetadata.tarballUrl, registrySettings]);
    });

    test('checkBundleAlreadyPublished() treats SBOMs as equal when only the packtory tool version differs', async function () {
        const previousSbom = buildSbomFixtureContent({ packtoryVersion: '1.2.3' });
        const currentSbom = buildSbomFixtureContent({ packtoryVersion: '9.9.9' });
        assert.strictEqual(await runSbomComparison(previousSbom, currentSbom), true);
    });

    test('checkBundleAlreadyPublished() still detects SBOM changes beyond the packtory tool version', async function () {
        const previousSbom = buildSbomWithDependency({
            packtoryVersion: '1.2.3',
            dependencyName: 'old-dependency',
            dependencyVersion: '1.0.0'
        });
        const currentSbom = buildSbomWithDependency({
            packtoryVersion: '9.9.9',
            dependencyName: 'new-dependency',
            dependencyVersion: '2.0.0'
        });
        assert.strictEqual(await runSbomComparison(previousSbom, currentSbom), false);
    });

    test('publish() publishes the given bundle', async function () {
        const buildTarball = fake.resolves({ tarData: emptyTarball });
        const publishPackage = fake.resolves(publishedOutcome);
        const emitter = emitterFactory({ buildTarball, publishPackage });
        const publishSettings = { access: 'public' } as const;

        await publishBundle(emitter, { publishSettings });

        assert.strictEqual(publishPackage.callCount, 1);
        assert.deepStrictEqual(publishPackage.firstCall.args, [
            { name: '', version: '' },
            emptyTarball,
            registrySettings,
            publishSettings,
            false
        ]);
    });

    test('publish() adds the current git head to the registry manifest without changing the bundle manifest', async function () {
        const buildTarball = fake.resolves({ tarData: emptyTarball });
        const publishPackage = fake.resolves(publishedOutcome);
        const bundle = versionedBundleWithManifest({
            packageJson: { name: 'the-name', version: '1.0.0' },
            manifestFile: { content: '{"name":"the-name","version":"1.0.0"}' }
        });
        const emitter = emitterFactory({
            buildTarball,
            publishPackage,
            readCurrentGitHead: async () => 'abcdef123456'
        });
        const publishSettings = { access: 'public' } as const;

        await publishBundle(emitter, { bundle, publishSettings });

        assert.deepStrictEqual(publishPackage.firstCall.args[0], {
            name: 'the-name',
            version: '1.0.0',
            gitHead: 'abcdef123456'
        });
        assert.deepStrictEqual(buildTarball.firstCall.args[0], bundle);
        assert.strictEqual(bundle.manifestFile.content, '{"name":"the-name","version":"1.0.0"}');
        assert.deepStrictEqual(bundle.packageJson, { name: 'the-name', version: '1.0.0' });
    });

    test('checkBundleAlreadyPublished() ignores gitHead-only manifest differences', async function () {
        const previousTarball = await createTarballBuilder().build([
            {
                filePath: 'package/package.json',
                content: '{"name":"the-name","version":"1.0.0","gitHead":"old"}',
                isExecutable: false
            }
        ]);
        const fetchLatestReleaseMetadata = fake.resolves(
            Maybe.just({
                version: latestReleaseMetadata.version,
                tarballUrl: latestReleaseMetadata.tarballUrl,
                publishedAt,
                gitHead: 'old'
            })
        );
        const fetchTarball = fake.resolves(previousTarball);
        const collectContents = fake.returns([
            {
                filePath: 'package/package.json',
                content: '{"name":"the-name","version":"1.0.0","gitHead":"new"}',
                isExecutable: false
            }
        ]);
        const emitter = emitterFactory({ fetchLatestReleaseMetadata, fetchTarball, collectContents });

        const result = await emitter.checkBundleAlreadyPublished({ registrySettings, bundle: namedBundle() });

        assert.strictEqual(result.alreadyPublishedAsLatest, true);
    });

    test('publish() forwards extra files to buildTarball', async function () {
        const buildTarball = fake.resolves({ tarData: emptyTarball });
        const emitter = emitterFactory({ buildTarball });
        const bundle = namedBundle();
        const extraFile = { filePath: 'sbom.cdx.json', content: '{}', isExecutable: false };

        await publishBundle(emitter, {
            bundle,
            publishSettings: { access: 'public' },
            extraFiles: [extraFile]
        });

        assert.deepStrictEqual(buildTarball.firstCall.args, [bundle, [extraFile]]);
    });

    test('publish() rejects under provenance auto mode when the manifest repository differs from the CI repository', async function () {
        const scenario = createPublishScenario('https://github.com/upstream/package');

        try {
            await publishBundle(scenario.emitter, {
                bundle: bundleWithRepository('https://github.com/foo/forked-package'),
                publishSettings: { access: 'public', provenance: { type: 'auto' } }
            });
        } catch (error) {
            assert.ok(error instanceof Error);
            assert.match(error.message, /repository URL does not match/u);
            assert.strictEqual(scenario.buildTarball.callCount, 0);
            assert.strictEqual(scenario.publishPackage.callCount, 0);
            return;
        }
        assert.fail('Expected publish() to throw');
    });

    test('publish() does not run the coherence check under provenance file mode', async function () {
        const scenario = createPublishScenario('https://github.com/upstream/package');

        await publishBundle(scenario.emitter, {
            bundle: bundleWithRepository('https://github.com/foo/forked-package'),
            publishSettings: { access: 'public', provenance: { type: 'file', path: '/build/bundle.sigstore' } }
        });

        assert.strictEqual(scenario.buildTarball.callCount, 1);
        assert.strictEqual(scenario.publishPackage.callCount, 1);
    });

    test('publish() does not run the coherence check when provenance is unset', async function () {
        const scenario = createPublishScenario(undefined);

        await publishBundle(scenario.emitter, {
            bundle: bundleWithRepository(undefined),
            publishSettings: { access: 'public' }
        });

        assert.strictEqual(scenario.buildTarball.callCount, 1);
        assert.strictEqual(scenario.publishPackage.callCount, 1);
    });

    test('publish() does not run the coherence check when access is restricted even if provenance is set to auto', async function () {
        const scenario = createPublishScenario('https://github.com/upstream/package');

        await publishBundle(scenario.emitter, {
            bundle: bundleWithRepository('https://github.com/foo/forked-package'),
            publishSettings: { access: 'restricted', provenance: { type: 'auto' } } as unknown as PublishSettings
        });

        assert.strictEqual(scenario.buildTarball.callCount, 1);
        assert.strictEqual(scenario.publishPackage.callCount, 1);
    });
});
