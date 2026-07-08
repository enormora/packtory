import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake, type SinonSpy } from 'sinon';
import { Maybe } from 'true-myth';
import { noPublication, publishedToRegistry, stagedForApproval } from '../bundle-emitter/publication-outcome.ts';
import type { AnalyzedBundle } from '../dead-code-eliminator/analyzed-bundle.ts';
import type { VersionedBundleWithManifest } from '../version-manager/versioned-bundle.ts';
import {
    createAnalyzedBundle,
    createBuildAndPublishOptions,
    createProcessor,
    createTransferableFile,
    createVersionedBundle,
    getCallArgs,
    type ProcessorContext,
    type TransferableFile
} from '../test-libraries/package-processor-test-support.ts';
import type { BuildAndPublishOptions } from './map-config.ts';
import type {
    BuildAndPublishResult,
    DetermineVersionAndPublishOptions,
    PackageProcessor
} from './package-processor.ts';

type SbomResult = readonly TransferableFile[] | undefined;

type SbomScenario = {
    readonly bundle: VersionedBundleWithManifest;
    readonly analyzedBundle: AnalyzedBundle;
    readonly generateSbom: SinonSpy;
    readonly checkBundleAlreadyPublished: SinonSpy;
    readonly processor: PackageProcessor;
};
type CurrentHeadRetryScenario = {
    readonly alreadyPublishedAsLatest: boolean;
    readonly artifactGitHead: string;
    readonly artifactVersion: string;
};

function nonEsmMainPackageJson(): BuildAndPublishOptions['mainPackageJson'] {
    return JSON.parse('{"type":"commonjs"}') as BuildAndPublishOptions['mainPackageJson'];
}

function publishedArtifacts(version: string, gitHead: string): BuildAndPublishResult['previousReleaseArtifacts'] {
    return Maybe.just({
        version,
        publishedAt: undefined,
        gitHead,
        files: []
    });
}

function providerVersioningBuildOptions(): BuildAndPublishOptions {
    return {
        ...createBuildAndPublishOptions(),
        versioning: {
            automatic: false,
            provideVersion() {
                throw new Error('missing package tag');
            }
        }
    };
}

function tryBuildOptions(buildOptions: BuildAndPublishOptions): DetermineVersionAndPublishOptions {
    return {
        analyzedBundle: createAnalyzedBundle(),
        buildOptions,
        stage: false
    };
}

async function expectMissingTagFailure(processor: PackageProcessor): Promise<void> {
    await assert.rejects(
        processor.tryBuildAndPublish(tryBuildOptions(providerVersioningBuildOptions())),
        { message: 'missing package tag' }
    );
}

function createCurrentHeadRetryProcessor(scenario: CurrentHeadRetryScenario): ProcessorContext {
    return createProcessor({
        determineCurrentVersion: fake.resolves(Maybe.just('1.2.3')),
        findCurrentHeadPublishedVersion: fake.resolves({ version: '1.2.3', gitHead: 'current-head' }),
        addVersion: fake.returns(createVersionedBundle()),
        checkBundleAlreadyPublished: fake.resolves({
            alreadyPublishedAsLatest: scenario.alreadyPublishedAsLatest,
            previousReleaseArtifacts: publishedArtifacts(scenario.artifactVersion, scenario.artifactGitHead)
        })
    });
}

suite('package-processor publish', function () {
    suite('main package validation', function () {
        test('tryBuildAndPublish() rejects non-ESM main package json before registry reads', async function () {
            const determineCurrentVersion = fake.resolves(Maybe.nothing());
            const { processor } = createProcessor({ determineCurrentVersion });

            await assert.rejects(
                processor.tryBuildAndPublish({
                    analyzedBundle: createAnalyzedBundle(),
                    buildOptions: { ...createBuildAndPublishOptions(), mainPackageJson: nonEsmMainPackageJson() },
                    stage: false
                }),
                { message: 'mainPackageJson.type must be "module"' }
            );
            assert.strictEqual(determineCurrentVersion.callCount, 0);
        });
    });

    suite('current-head retry publishing', function () {
        test('tryBuildAndPublish() finalizes current-head registry packages before provider versioning', async function () {
            const publish = fake.resolves(undefined);
            const determineCurrentVersion = fake.rejects(new Error('version provider should not run'));
            const findCurrentHeadPublishedVersion = fake.resolves({ version: '1.2.3', gitHead: 'current-head' });
            const { processor } = createProcessor({
                determineCurrentVersion,
                findCurrentHeadPublishedVersion,
                addVersion: fake.returns(createVersionedBundle()),
                checkBundleAlreadyPublished: fake.resolves({
                    alreadyPublishedAsLatest: true,
                    previousReleaseArtifacts: publishedArtifacts('1.2.3', 'current-head')
                }),
                publish
            });

            const result = await processor.tryBuildAndPublish(tryBuildOptions(providerVersioningBuildOptions()));

            assert.strictEqual(result.status, 'already-published');
            assert.strictEqual(result.bundle.version, '1.2.3');
            assert.deepStrictEqual(findCurrentHeadPublishedVersion.firstCall.args, [
                {
                    name: 'package-a',
                    registrySettings: { auth: { type: 'bearer-token', token: 'token' } }
                }
            ]);
            assert.strictEqual(determineCurrentVersion.callCount, 0);
            assert.strictEqual(publish.callCount, 0);
        });

        test('tryBuildAndPublish() falls back when current-head registry contents differ', async function () {
            const { processor, determineCurrentVersion } = createCurrentHeadRetryProcessor({
                alreadyPublishedAsLatest: false,
                artifactVersion: '1.2.3',
                artifactGitHead: 'current-head'
            });

            await expectMissingTagFailure(processor);

            assert.strictEqual(determineCurrentVersion.callCount, 1);
        });

        for (
            const scenario of [
                { name: 'versions', artifactVersion: '1.2.4', artifactGitHead: 'current-head' },
                { name: 'git heads', artifactVersion: '1.2.3', artifactGitHead: 'other-head' }
            ] as const
        ) {
            test(
                `tryBuildAndPublish() falls back when current-head registry metadata changes ${scenario.name}`,
                async function () {
                    const { processor } = createCurrentHeadRetryProcessor({
                        alreadyPublishedAsLatest: true,
                        ...scenario
                    });

                    await expectMissingTagFailure(processor);
                }
            );
        }

        test('tryBuildAndPublish() skips current-head retry detection in stage mode', async function () {
            const findCurrentHeadPublishedVersion = fake.resolves({ version: '1.2.3', gitHead: 'current-head' });
            const { processor } = createProcessor({
                determineCurrentVersion: fake.resolves(Maybe.just('1.2.3')),
                findCurrentHeadPublishedVersion,
                addVersion: fake.returns(createVersionedBundle()),
                checkBundleAlreadyPublished: fake.resolves({
                    alreadyPublishedAsLatest: true,
                    previousReleaseArtifacts: publishedArtifacts('1.2.3', 'current-head')
                })
            });

            await processor.tryBuildAndPublish({
                analyzedBundle: createAnalyzedBundle(),
                buildOptions: {
                    ...createBuildAndPublishOptions(),
                    versioning: { automatic: false, version: '1.2.3' }
                },
                stage: true
            });

            assert.strictEqual(findCurrentHeadPublishedVersion.callCount, 0);
        });
    });

    suite('version and publishing', function () {
        test('buildAndPublish() returns immediately when the package is already published', async function () {
            const publish = fake.resolves(undefined);
            const alreadyPublishedResult: BuildAndPublishResult = {
                bundle: createVersionedBundle(),
                status: 'already-published',
                publication: noPublication,
                extraFiles: [],
                previousReleaseArtifacts: Maybe.nothing()
            };
            const { processor, emit } = createProcessor({
                determineCurrentVersion: fake.resolves(Maybe.just('1.2.3')),
                addVersion: fake.returns(createVersionedBundle()),
                checkBundleAlreadyPublished: fake.resolves({
                    alreadyPublishedAsLatest: true,
                    previousReleaseArtifacts: Maybe.nothing()
                }),
                publish
            });

            const result = await processor.buildAndPublish({
                analyzedBundle: createAnalyzedBundle(),
                buildOptions: createBuildAndPublishOptions(),
                stage: false
            });

            assert.deepStrictEqual(result, alreadyPublishedResult);
            assert.strictEqual(publish.callCount, 0);
            assert.deepStrictEqual(getCallArgs(emit), [ [ 'building', {
                packageName: 'package-a',
                version: '1.2.3'
            } ] ]);
        });

        test('tryBuildAndPublish() emits version-determined events for pinned initial versions', async function () {
            const emit = fake();
            const { processor } = createProcessor({
                determineCurrentVersion: fake.resolves(Maybe.nothing()),
                addVersion: fake.returns(createVersionedBundle('package-a', '2.0.0')),
                emit,
                hasSubscribers: fake(function (eventName: string) {
                    return eventName === 'versionDetermined';
                })
            });

            const result = await processor.tryBuildAndPublish({
                analyzedBundle: createAnalyzedBundle(),
                buildOptions: {
                    ...createBuildAndPublishOptions(),
                    versioning: { automatic: false, version: '2.0.0' }
                },
                stage: false
            });

            assert.deepStrictEqual(result, {
                bundle: createVersionedBundle('package-a', '2.0.0'),
                status: 'initial-version',
                publication: noPublication,
                extraFiles: [],
                previousReleaseArtifacts: Maybe.nothing()
            });
            assert.deepStrictEqual(getCallArgs(emit), [
                [ 'building', { packageName: 'package-a', version: '2.0.0' } ],
                [
                    'versionDetermined',
                    {
                        packageName: 'package-a',
                        previousVersion: undefined,
                        chosenVersion: '2.0.0',
                        trigger: 'pinned'
                    }
                ]
            ]);
        });

        test('tryBuildAndPublish() emits version-determined events after automatic bumps', async function () {
            const emit = fake();
            const { processor } = createProcessor({
                determineCurrentVersion: fake.resolves(Maybe.just('1.2.3')),
                addVersion: fake.returns(createVersionedBundle('package-a', '1.2.3')),
                increaseVersion: fake.returns(createVersionedBundle('package-a', '1.2.4')),
                emit,
                hasSubscribers: fake(function (eventName: string) {
                    return eventName === 'versionDetermined';
                })
            });

            const result = await processor.tryBuildAndPublish({
                analyzedBundle: createAnalyzedBundle(),
                buildOptions: createBuildAndPublishOptions(),
                stage: false
            });

            assert.strictEqual(result.bundle.version, '1.2.4');
            assert.deepStrictEqual(emit.getCall(2).args, [
                'versionDetermined',
                {
                    packageName: 'package-a',
                    previousVersion: '1.2.3',
                    chosenVersion: '1.2.4',
                    trigger: 'auto-patch-bump'
                }
            ]);
        });

        test('tryBuildAndPublish() reports automatic initial bumps as auto patch bumps', async function () {
            const emit = fake();
            const { processor } = createProcessor({
                determineCurrentVersion: fake.resolves(Maybe.nothing()),
                addVersion: fake.returns(createVersionedBundle('package-a', '0.0.0')),
                increaseVersion: fake.returns(createVersionedBundle('package-a', '0.0.1')),
                emit,
                hasSubscribers: fake(function (eventName: string) {
                    return eventName === 'versionDetermined';
                })
            });

            const result = await processor.tryBuildAndPublish({
                analyzedBundle: createAnalyzedBundle(),
                buildOptions: createBuildAndPublishOptions(),
                stage: false
            });

            assert.strictEqual(result.bundle.version, '0.0.1');
            assert.deepStrictEqual(emit.getCall(2).args, [
                'versionDetermined',
                {
                    packageName: 'package-a',
                    previousVersion: undefined,
                    chosenVersion: '0.0.1',
                    trigger: 'auto-patch-bump'
                }
            ]);
        });

        test('buildAndPublish() publishes the rebuilt bundle and emits publishing progress', async function () {
            const rebuiltBundle = createVersionedBundle('package-a', '1.2.4');
            const addVersion = fake.returns(createVersionedBundle('package-a', '1.2.3'));
            const publish = fake.resolves(publishedToRegistry);
            const { processor, emit } = createProcessor({
                determineCurrentVersion: fake.resolves(Maybe.just('1.2.3')),
                addVersion,
                increaseVersion: fake.returns(rebuiltBundle),
                publish
            });

            const options: DetermineVersionAndPublishOptions = {
                analyzedBundle: createAnalyzedBundle(),
                buildOptions: createBuildAndPublishOptions(),
                stage: false
            };
            const result = await processor.buildAndPublish(options);

            assert.deepStrictEqual(result, {
                bundle: rebuiltBundle,
                status: 'new-version',
                publication: publishedToRegistry,
                extraFiles: [],
                previousReleaseArtifacts: Maybe.nothing()
            });
            assert.deepStrictEqual(addVersion.firstCall.args[0], {
                bundle: createAnalyzedBundle(),
                ...options.buildOptions,
                version: '1.2.3',
                substitutionPublicModuleSourcePaths: undefined
            });
            assert.deepStrictEqual(publish.firstCall.args, [
                {
                    bundle: rebuiltBundle,
                    registrySettings: { auth: { type: 'bearer-token', token: 'token' } },
                    publishSettings: { access: 'public', sbom: { enabled: false } },
                    stage: false
                }
            ]);
            assert.deepStrictEqual(getCallArgs(emit), [
                [ 'building', { packageName: 'package-a', version: '1.2.3' } ],
                [ 'rebuilding', { packageName: 'package-a', version: '1.2.3' } ],
                [ 'publishing', { packageName: 'package-a', version: '1.2.4' } ]
            ]);
        });

        test('buildAndPublish() returns a staged publication outcome when stage mode is enabled', async function () {
            const rebuiltBundle = createVersionedBundle('package-a', '1.2.4');
            const publish = fake.resolves(stagedForApproval('stage-123'));
            const { processor } = createProcessor({
                determineCurrentVersion: fake.resolves(Maybe.just('1.2.3')),
                addVersion: fake.returns(createVersionedBundle('package-a', '1.2.3')),
                increaseVersion: fake.returns(rebuiltBundle),
                publish
            });

            const result = await processor.buildAndPublish({
                analyzedBundle: createAnalyzedBundle(),
                buildOptions: createBuildAndPublishOptions(),
                stage: true
            });

            assert.deepStrictEqual(result.publication, stagedForApproval('stage-123'));
            assert.strictEqual((publish.firstCall.args[0] as { readonly stage: boolean; }).stage, true);
        });

        test('buildAndPublish() passes generated extra files to publish', async function () {
            const sbomFile = createTransferableFile('/sbom.cdx.json', 'sbom.cdx.json');
            const rebuiltBundle = createVersionedBundle('package-a', '1.2.4');
            const publish = fake.resolves(publishedToRegistry);
            const { processor } = createProcessor({
                determineCurrentVersion: fake.resolves(Maybe.just('1.2.3')),
                addVersion: fake.returns(createVersionedBundle('package-a', '1.2.3')),
                increaseVersion: fake.returns(rebuiltBundle),
                generateSbom: fake.resolves([ sbomFile ]),
                publish
            });

            await processor.buildAndPublish({
                analyzedBundle: createAnalyzedBundle(),
                buildOptions: createBuildAndPublishOptions(),
                stage: false
            });

            assert.deepStrictEqual(
                (publish.firstCall.args[0] as { readonly extraFiles: readonly unknown[]; }).extraFiles,
                [
                    sbomFile
                ]
            );
        });
    });

    function setupSbomScenario(sbomResult: SbomResult): SbomScenario {
        const bundle = createVersionedBundle('package-a', '1.2.3');
        const analyzedBundle = createAnalyzedBundle();
        const generateSbom = fake.resolves(sbomResult);
        const checkBundleAlreadyPublished = fake.resolves({
            alreadyPublishedAsLatest: false,
            previousReleaseArtifacts: Maybe.nothing()
        });
        const { processor } = createProcessor({
            determineCurrentVersion: fake.resolves(Maybe.just('1.2.3')),
            addVersion: fake.returns(bundle),
            checkBundleAlreadyPublished,
            generateSbom
        });
        return { bundle, analyzedBundle, generateSbom, checkBundleAlreadyPublished, processor };
    }

    function assertGeneratedSbom(
        generateSbom: SinonSpy,
        bundle: VersionedBundleWithManifest,
        buildOptions: BuildAndPublishOptions
    ): void {
        assert.strictEqual(generateSbom.callCount, 2);
        const expectedSiblings = [ ...buildOptions.bundleDependencies, ...buildOptions.bundlePeerDependencies ];
        assert.deepStrictEqual(generateSbom.firstCall.args, [
            bundle,
            expectedSiblings,
            { access: 'public', sbom: { enabled: true } }
        ]);
        const secondCallBundle = generateSbom.secondCall.args[0] as VersionedBundleWithManifest;
        assert.strictEqual(secondCallBundle.version, '1.2.4');
    }

    suite('sbom extra files', function () {
        test('tryBuildAndPublish() invokes the sbomFileBuilder for the pre-bump bundle to feed the already-published check, then again for the post-bump bundle', async function () {
            const sbomFile = createTransferableFile('/sbom.cdx.json', 'sbom.cdx.json');
            const { bundle, analyzedBundle, generateSbom, checkBundleAlreadyPublished, processor } = setupSbomScenario([
                sbomFile
            ]);

            const buildOptions: BuildAndPublishOptions = {
                ...createBuildAndPublishOptions(),
                publishSettings: { access: 'public', sbom: { enabled: true } }
            };
            await processor.tryBuildAndPublish({ analyzedBundle, buildOptions, stage: false });

            assertGeneratedSbom(generateSbom, bundle, buildOptions);
            const checkArgs = checkBundleAlreadyPublished.firstCall.args[0] as {
                readonly extraFiles: readonly unknown[];
            };
            assert.deepStrictEqual(checkArgs.extraFiles, [ sbomFile ]);
        });

        test('tryBuildAndPublish() omits extraFiles when sbomFileBuilder returns undefined', async function () {
            const { analyzedBundle, checkBundleAlreadyPublished, processor } = setupSbomScenario(undefined);

            await processor.tryBuildAndPublish({
                analyzedBundle,
                buildOptions: createBuildAndPublishOptions(),
                stage: false
            });

            const checkArgs = checkBundleAlreadyPublished.firstCall.args[0] as Record<string, unknown>;
            assert.strictEqual(Object.hasOwn(checkArgs, 'extraFiles'), false);
        });
    });
});
