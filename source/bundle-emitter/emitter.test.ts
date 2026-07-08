import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake, type SinonSpy } from 'sinon';
import { Maybe } from 'true-myth';
import { createTarballBuilder } from '../tar/tarball-builder.ts';
import { versionedBundleWithManifest } from '../test-libraries/bundle-fixtures.ts';
import { buildSbomFixtureContent } from '../test-libraries/sbom-fixtures.ts';
import { emptyTarball, tarballWithOneFile } from '../test-libraries/tarball-fixtures.ts';
import type { VersionedBundleWithManifest } from '../version-manager/versioned-bundle.ts';
import { createBundleEmitter, type BundleEmitterDependencies, type BundleEmitter } from './emitter.ts';

const registrySettings = { auth: { type: 'bearer-token', token: 'the-token' } } as const;
const publishedAt = new Date('2026-05-20T00:00:00.000Z');
const latestReleaseMetadata = {
    version: '1.2.3',
    tarballUrl: 'https://registry.example.test/package.tgz',
    publishedAt,
    gitHead: undefined
} as const;
type CurrentVersionRequest = Parameters<BundleEmitter['determineCurrentVersion']>[0];
type BundlePublishedCheckResult = Awaited<ReturnType<BundleEmitter['checkBundleAlreadyPublished']>>;
type CurrentVersionParams = {
    readonly stage: boolean;
    readonly versioning: CurrentVersionRequest['versioning'];
    readonly registrySettings?: CurrentVersionRequest['registrySettings'];
};
type SbomDependency = {
    readonly packtoryVersion: string;
    readonly dependencyName: string;
    readonly dependencyVersion: string;
};
type PublishedBundleScenario = {
    readonly emitter: BundleEmitter;
    readonly collectContents: SinonSpy;
    readonly fetchTarball: SinonSpy;
};
type PreviousReleaseArtifactsSummary = {
    readonly version: string;
    readonly publishedAt?: Date | undefined;
    readonly files: readonly unknown[];
};

function namedBundle(): VersionedBundleWithManifest {
    return versionedBundleWithManifest({ name: 'the-name' });
}

type Overrides = {
    readonly fetchLatestVersion?: SinonSpy;
    readonly fetchStagedVersions?: SinonSpy;
    readonly fetchLatestReleaseMetadata?: SinonSpy;
    readonly collectContents?: SinonSpy;
    readonly fetchTarball?: SinonSpy;
    readonly currentGitHead?: string | undefined;
};

function createSpy<TSpy extends Readonly<SinonSpy>>(spy: TSpy | undefined, fallback: () => TSpy): TSpy {
    return spy ?? fallback();
}

function emitterFactory(overrides: Overrides = {}): BundleEmitter {
    const dependencies: BundleEmitterDependencies = {
        artifactsBuilder: {
            buildTarball: fake.resolves({ tarData: emptyTarball }),
            collectContents: createSpy(overrides.collectContents, function () {
                return fake.returns([]);
            }),
            buildFolder: fake(),
            buildZip: fake()
        },
        registryClient: {
            publishPackage: fake(),
            fetchLatestReleaseMetadata: createSpy(
                overrides.fetchLatestReleaseMetadata,
                fake
            ) as unknown as BundleEmitterDependencies['registryClient']['fetchLatestReleaseMetadata'],
            fetchLatestVersion: createSpy(
                overrides.fetchLatestVersion,
                fake
            ) as unknown as BundleEmitterDependencies['registryClient']['fetchLatestVersion'],
            fetchStagedVersions: createSpy(
                overrides.fetchStagedVersions,
                fake
            ) as unknown as BundleEmitterDependencies['registryClient']['fetchStagedVersions'],
            fetchTarball: createSpy(overrides.fetchTarball, function () {
                return fake.resolves(emptyTarball);
            })
        },
        ciRepositoryUrl: undefined,
        async readCurrentGitHead() {
            return overrides.currentGitHead;
        }
    };

    return createBundleEmitter(dependencies);
}

function currentVersionRequest(params: CurrentVersionParams): CurrentVersionRequest {
    return {
        name: 'the-name',
        registrySettings: params.registrySettings ?? registrySettings,
        stage: params.stage,
        versioning: params.versioning
    };
}

async function determineCurrentVersion(
    emitter: BundleEmitter,
    params: CurrentVersionParams
): Promise<Maybe<string>> {
    return emitter.determineCurrentVersion(currentVersionRequest(params));
}

async function expectCurrentVersionFailure(
    emitter: BundleEmitter,
    params: CurrentVersionParams,
    matcher: RegExp
): Promise<void> {
    await assert.rejects(async function () {
        await determineCurrentVersion(emitter, params);
    }, matcher);
}

function buildSbomWithDependency(params: SbomDependency): string {
    return buildSbomFixtureContent({
        packtoryVersion: params.packtoryVersion,
        dependencyComponents: [ { name: params.dependencyName, version: params.dependencyVersion } ]
    });
}

function createPublishedBundleScenario(): PublishedBundleScenario {
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
    const collectContents = fake.returns([ { filePath: 'sbom.cdx.json', content: currentSbom, isExecutable: false } ]);
    const emitter = emitterFactory({ fetchLatestReleaseMetadata, fetchTarball, collectContents });
    const result = await emitter.checkBundleAlreadyPublished({ registrySettings, bundle: namedBundle() });
    return result.alreadyPublishedAsLatest;
}

function assertPreviousReleaseArtifacts(
    value: PreviousReleaseArtifactsSummary,
    expectedFileCount?: number
): void {
    assert.partialDeepStrictEqual(value, {
        version: latestReleaseMetadata.version,
        publishedAt
    });

    if (expectedFileCount !== undefined) {
        assert.strictEqual(value.files.length, expectedFileCount);
    }
}

function assertDifferentContentsResult(
    result: BundlePublishedCheckResult,
    bundle: VersionedBundleWithManifest,
    collectContents: SinonSpy,
    fetchTarball: SinonSpy
): void {
    assert.strictEqual(result.alreadyPublishedAsLatest, false);
    if (result.previousReleaseArtifacts.isNothing) {
        assert.fail('expected previousReleaseArtifacts to be present');
    }
    assertPreviousReleaseArtifacts(result.previousReleaseArtifacts.value, 1);
    assert.deepStrictEqual(collectContents.firstCall.args, [ bundle, 'package', undefined ]);
    assert.deepStrictEqual(fetchTarball.firstCall.args, [ latestReleaseMetadata.tarballUrl, registrySettings ]);
}

function assertMatchingContentsResult(
    result: BundlePublishedCheckResult,
    collectContents: SinonSpy,
    fetchTarball: SinonSpy
): void {
    assert.strictEqual(result.alreadyPublishedAsLatest, true);
    if (result.previousReleaseArtifacts.isNothing) {
        assert.fail('expected previousReleaseArtifacts to be present');
    }
    assertPreviousReleaseArtifacts(result.previousReleaseArtifacts.value);
    assert.deepStrictEqual(collectContents.firstCall.args[1], 'package');
    assert.deepStrictEqual(fetchTarball.firstCall.args, [ latestReleaseMetadata.tarballUrl, registrySettings ]);
}

suite('emitter', function () {
    suite('current version lookup', function () {
        test('determineCurrentVersion() fetches the latest version when automatic versioning is enabled', async function () {
            const fetchLatestVersion = fake.resolves(Maybe.nothing());
            const emitter = emitterFactory({ fetchLatestVersion });

            await determineCurrentVersion(emitter, { stage: false, versioning: { automatic: true } });

            assert.deepStrictEqual(
                { callCount: fetchLatestVersion.callCount, args: fetchLatestVersion.firstCall.args },
                { callCount: 1, args: [ 'the-name', registrySettings ] }
            );
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

        test('determineCurrentVersion() doesn’t fetch the latest version when static manual versioning is enabled', async function () {
            const fetchLatestVersion = fake.resolves(Maybe.nothing());
            const emitter = emitterFactory({ fetchLatestVersion });

            await determineCurrentVersion(emitter, {
                stage: false,
                versioning: { automatic: false, version: '' }
            });

            assert.strictEqual(fetchLatestVersion.callCount, 0);
        });

        test('determineCurrentVersion() returns the given version when static manual versioning is enabled', async function () {
            const emitter = emitterFactory({});

            const result = await determineCurrentVersion(emitter, {
                stage: false,
                versioning: { automatic: false, version: 'manual-version' }
            });

            assert.deepStrictEqual(result, Maybe.just('manual-version'));
        });

        test('determineCurrentVersion() fetches the latest version when provider manual versioning is enabled', async function () {
            const fetchLatestVersion = fake.resolves(Maybe.just({ version: '1.2.3' }));
            const emitter = emitterFactory({ fetchLatestVersion });

            const result = await determineCurrentVersion(emitter, {
                stage: false,
                versioning: {
                    automatic: false,
                    provideVersion() {
                        return '9.9.9';
                    }
                }
            });

            assert.deepStrictEqual(result, Maybe.just('1.2.3'));
            assert.deepStrictEqual(fetchLatestVersion.firstCall.args, [ 'the-name', registrySettings ]);
        });
    });

    suite('current-head published version lookup', function () {
        test('findCurrentHeadPublishedVersion() returns the latest version when gitHead matches current HEAD', async function () {
            const fetchLatestVersion = fake.resolves(Maybe.just({ version: '1.2.3', gitHead: 'current-head' }));
            const emitter = emitterFactory({ fetchLatestVersion, currentGitHead: 'current-head' });

            const result = await emitter.findCurrentHeadPublishedVersion({
                name: 'the-name',
                registrySettings
            });

            assert.deepStrictEqual(result, { version: '1.2.3', gitHead: 'current-head' });
            assert.deepStrictEqual(fetchLatestVersion.firstCall.args, [ 'the-name', registrySettings ]);
        });

        test('findCurrentHeadPublishedVersion() returns undefined when no current HEAD is available', async function () {
            const fetchLatestVersion = fake.resolves(Maybe.just({ version: '1.2.3', gitHead: 'current-head' }));
            const emitter = emitterFactory({ fetchLatestVersion, currentGitHead: undefined });

            assert.strictEqual(
                await emitter.findCurrentHeadPublishedVersion({ name: 'the-name', registrySettings }),
                undefined
            );
            assert.strictEqual(fetchLatestVersion.callCount, 0);
        });

        test('findCurrentHeadPublishedVersion() returns undefined when the registry has no latest version', async function () {
            const fetchLatestVersion = fake.resolves(Maybe.nothing());
            const emitter = emitterFactory({ fetchLatestVersion, currentGitHead: 'current-head' });

            assert.strictEqual(
                await emitter.findCurrentHeadPublishedVersion({ name: 'the-name', registrySettings }),
                undefined
            );
        });

        test('findCurrentHeadPublishedVersion() returns undefined when gitHead differs', async function () {
            const fetchLatestVersion = fake.resolves(Maybe.just({ version: '1.2.3', gitHead: 'other-head' }));
            const emitter = emitterFactory({ fetchLatestVersion, currentGitHead: 'current-head' });

            assert.strictEqual(
                await emitter.findCurrentHeadPublishedVersion({ name: 'the-name', registrySettings }),
                undefined
            );
        });
    });

    suite('staged current version lookup', function () {
        test('determineCurrentVersion() selects the highest staged version in stage mode', async function () {
            for (
                const stagedVersions of [
                    [ '1.2.4', '1.2.5' ],
                    [ '1.2.5', '1.2.4' ]
                ] as const
            ) {
                const fetchLatestVersion = fake.resolves(Maybe.just({ version: '1.2.3' }));
                const fetchStagedVersions = fake.resolves(stagedVersions);
                const emitter = emitterFactory({ fetchLatestVersion, fetchStagedVersions });

                const result = await determineCurrentVersion(emitter, {
                    stage: true,
                    versioning: { automatic: true }
                });

                assert.deepStrictEqual(result, Maybe.just('1.2.5'));
                assert.deepStrictEqual(fetchStagedVersions.firstCall.args, [ 'the-name', registrySettings ]);
            }
        });

        test('determineCurrentVersion() returns the configured manual version in stage mode after validating package existence', async function () {
            const fetchLatestVersion = fake.resolves(Maybe.just({ version: '1.2.3' }));
            const fetchStagedVersions = fake.resolves([ '1.2.4' ]);
            const emitter = emitterFactory({ fetchLatestVersion, fetchStagedVersions });

            const result = await determineCurrentVersion(emitter, {
                stage: true,
                versioning: { automatic: false, version: '9.9.9' }
            });

            assert.deepStrictEqual(result, Maybe.just('9.9.9'));
            assert.strictEqual(fetchStagedVersions.callCount, 0);
        });

        test('determineCurrentVersion() selects the highest staged version for provider manual versioning in stage mode', async function () {
            const fetchLatestVersion = fake.resolves(Maybe.just({ version: '1.2.3' }));
            const fetchStagedVersions = fake.resolves([ '1.2.5', '1.2.4' ]);
            const emitter = emitterFactory({ fetchLatestVersion, fetchStagedVersions });

            const result = await determineCurrentVersion(emitter, {
                stage: true,
                versioning: {
                    automatic: false,
                    provideVersion() {
                        return '9.9.9';
                    }
                }
            });

            assert.deepStrictEqual(result, Maybe.just('1.2.5'));
            assert.deepStrictEqual(fetchStagedVersions.firstCall.args, [ 'the-name', registrySettings ]);
        });

        test('determineCurrentVersion() rejects an invalid staged version returned by the registry', async function () {
            const fetchLatestVersion = fake.resolves(Maybe.just({ version: '1.2.3' }));
            const fetchStagedVersions = fake.resolves([ 'not-semver' ]);
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
    });

    suite('published bundle checks', function () {
        test('checkBundleAlreadyPublished() fetches the latest release metadata', async function () {
            const fetchLatestReleaseMetadata = fake.resolves(Maybe.nothing());
            const emitter = emitterFactory({ fetchLatestReleaseMetadata });

            await emitter.checkBundleAlreadyPublished({
                registrySettings,
                bundle: namedBundle()
            });

            assert.deepStrictEqual(
                {
                    callCount: fetchLatestReleaseMetadata.callCount,
                    args: fetchLatestReleaseMetadata.firstCall.args
                },
                { callCount: 1, args: [ 'the-name', registrySettings ] }
            );
        });

        test('checkBundleAlreadyPublished() returns false and Nothing when there is no latest version in the registry', async function () {
            const fetchLatestReleaseMetadata = fake.resolves(Maybe.nothing());
            const collectContents = fake.returns([]);
            const emitter = emitterFactory({ fetchLatestReleaseMetadata, collectContents });

            const result = await emitter.checkBundleAlreadyPublished({
                registrySettings,
                bundle: namedBundle()
            });

            assert.deepStrictEqual(
                {
                    alreadyPublishedAsLatest: result.alreadyPublishedAsLatest,
                    previousReleaseArtifactsIsNothing: result.previousReleaseArtifacts.isNothing
                },
                {
                    alreadyPublishedAsLatest: false,
                    previousReleaseArtifactsIsNothing: true
                }
            );
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

            assertDifferentContentsResult(result, bundle, collectContents, fetchTarball);
        });

        test('checkBundleAlreadyPublished() forwards extra files to collectContents', async function () {
            const checkScenario = createPublishedBundleScenario();
            const bundle = namedBundle();
            const extraFile = { filePath: 'sbom.cdx.json', content: '{}', isExecutable: false };
            await checkScenario.emitter.checkBundleAlreadyPublished({
                registrySettings,
                bundle,
                extraFiles: [ extraFile ]
            });

            assert.deepStrictEqual(checkScenario.collectContents.firstCall.args, [ bundle, 'package', [ extraFile ] ]);
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

            assertMatchingContentsResult(result, collectContents, fetchTarball);
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
    });
});
