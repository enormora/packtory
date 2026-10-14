import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake } from 'sinon';
import { Maybe } from 'true-myth';
import {
    assertDifferentContentsResult,
    assertMatchingContentsResult,
    buildSoftwareBillOfMaterialsWithDependency,
    createPublishedBundleScenario,
    determineCurrentVersion,
    emitterFactory,
    expectCurrentVersionFailure,
    latestReleaseMetadata,
    namedBundle,
    registrySettings,
    runSoftwareBillOfMaterialsComparison
} from '../test-libraries/bundle-emitter-fixtures.ts';
import { buildSoftwareBillOfMaterialsFixtureContent } from '../test-libraries/software-bill-of-materials-fixtures.ts';
import { emptyTarball, tarballWithOneFile } from '../test-libraries/tarball-fixtures.ts';

suite('emitter', function () {
    suite('current version lookup', function () {
        test('determineCurrentVersion() fetches the latest version when automatic versioning is enabled', async function () {
            const fetchLatestVersion = fake.resolves(Maybe.nothing());
            const emitter = emitterFactory({ fetchLatestVersion });

            await determineCurrentVersion(emitter, { stage: false, versioning: { automatic: true } });

            assert.deepStrictEqual(
                { callCount: fetchLatestVersion.callCount, arguments: fetchLatestVersion.firstCall.args },
                { callCount: 1, arguments: [ 'the-name', registrySettings ] }
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
                        registryAddress: 'https://registry.example.test',
                        authentication: { type: 'bearer-token', token: 'the-token' }
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
                    arguments: fetchLatestReleaseMetadata.firstCall.args
                },
                { callCount: 1, arguments: [ 'the-name', registrySettings ] }
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
            const extraFile = {
                filePath: 'software-bill-of-materials.cyclonedx.json',
                content: '{}',
                isExecutable: false
            };
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
            const previousSoftwareBillOfMaterials = buildSoftwareBillOfMaterialsFixtureContent({
                packtoryVersion: '1.2.3'
            });
            const currentSoftwareBillOfMaterials = buildSoftwareBillOfMaterialsFixtureContent({
                packtoryVersion: '9.9.9'
            });
            assert.strictEqual(
                await runSoftwareBillOfMaterialsComparison(
                    previousSoftwareBillOfMaterials,
                    currentSoftwareBillOfMaterials
                ),
                true
            );
        });

        test('checkBundleAlreadyPublished() still detects SBOM changes beyond the packtory tool version', async function () {
            const previousSoftwareBillOfMaterials = buildSoftwareBillOfMaterialsWithDependency({
                packtoryVersion: '1.2.3',
                dependencyName: 'old-dependency',
                dependencyVersion: '1.0.0'
            });
            const currentSoftwareBillOfMaterials = buildSoftwareBillOfMaterialsWithDependency({
                packtoryVersion: '9.9.9',
                dependencyName: 'new-dependency',
                dependencyVersion: '2.0.0'
            });
            assert.strictEqual(
                await runSoftwareBillOfMaterialsComparison(
                    previousSoftwareBillOfMaterials,
                    currentSoftwareBillOfMaterials
                ),
                false
            );
        });
    });
});
