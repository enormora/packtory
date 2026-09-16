import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake, type SinonSpy } from 'sinon';
import { Maybe } from 'true-myth';
import { noPublication, publishedToRegistry } from '../bundle-emitter/publication-outcome.ts';
import {
    createAnalyzedBundle,
    createBuildAndPublishOptions,
    createProcessor,
    createTransferableFile,
    createVersionedBundle,
    type ProcessorContext
} from '../test-libraries/package-processor-test-support.ts';
import type { BuildAndPublishResult } from './package-processor.ts';

type AutomaticBumpOverrides = {
    readonly generateSbom?: SinonSpy;
    readonly publish?: SinonSpy;
    readonly smokePublishedArtifact?: SinonSpy;
    readonly verifyBundlePublishTarget: SinonSpy;
};
type AutomaticBumpScenario = {
    readonly processor: ProcessorContext['processor'];
    readonly rebuiltBundle: BuildAndPublishResult['bundle'];
};

function publishedArtifacts(version: string, gitHead: string): BuildAndPublishResult['previousReleaseArtifacts'] {
    return Maybe.just({
        version,
        publishedAt: undefined,
        gitHead,
        files: []
    });
}

function createAutomaticBumpProcessor(overrides: AutomaticBumpOverrides): AutomaticBumpScenario {
    const rebuiltBundle = createVersionedBundle('package-a', '1.2.4');
    const context = createProcessor({
        determineCurrentVersion: fake.resolves(Maybe.just('1.2.3')),
        addVersion: fake.returns(createVersionedBundle('package-a', '1.2.3')),
        increaseVersion: fake.returns(rebuiltBundle),
        ...overrides.generateSbom === undefined ? {} : { generateSbom: overrides.generateSbom },
        verifyBundlePublishTarget: overrides.verifyBundlePublishTarget,
        ...overrides.smokePublishedArtifact === undefined
            ? {}
            : { smokePublishedArtifact: overrides.smokePublishedArtifact },
        ...overrides.publish === undefined ? {} : { publish: overrides.publish }
    });

    return {
        processor: context.processor,
        rebuiltBundle
    };
}

suite('package-processor publish target preflight', function () {
    test('tryBuildAndPublish() rejects automatic target version artifact collisions before publish', async function () {
        const verifyBundlePublishTarget = fake.rejects(
            new Error('Package "package-a" version "1.2.4" already exists with different artifacts')
        );
        const publish = fake.resolves(publishedToRegistry);
        const { processor, rebuiltBundle } = createAutomaticBumpProcessor({
            verifyBundlePublishTarget,
            publish
        });

        await assert.rejects(async function () {
            await processor.tryBuildAndPublish({
                analyzedBundle: createAnalyzedBundle(),
                buildOptions: createBuildAndPublishOptions(),
                stage: false
            });
        }, { message: 'Package "package-a" version "1.2.4" already exists with different artifacts' });
        assert.deepStrictEqual(verifyBundlePublishTarget.firstCall.args, [
            {
                bundle: rebuiltBundle,
                registrySettings: { auth: { type: 'bearer-token', token: 'token' } }
            }
        ]);
        assert.strictEqual(publish.callCount, 0);
    });

    test('tryBuildAndPublish() smoke-checks changed target artifacts after exact target checks', async function () {
        const verifyBundlePublishTarget = fake.resolves({
            alreadyPublished: false,
            publishedArtifacts: Maybe.nothing()
        });
        const smokePublishedArtifact = fake.resolves(undefined);
        const { processor, rebuiltBundle } = createAutomaticBumpProcessor({
            verifyBundlePublishTarget,
            smokePublishedArtifact
        });
        const analyzedBundle = createAnalyzedBundle();
        const buildOptions = createBuildAndPublishOptions();

        await processor.tryBuildAndPublish({ analyzedBundle, buildOptions, stage: false });

        assert.strictEqual(smokePublishedArtifact.callCount, 1);
        assert.strictEqual(verifyBundlePublishTarget.calledBefore(smokePublishedArtifact), true);
        assert.deepStrictEqual(smokePublishedArtifact.firstCall.args, [
            {
                analyzedBundle,
                bundle: rebuiltBundle,
                extraFiles: [],
                dependencyBundles: [
                    ...buildOptions.bundleDependencies,
                    ...buildOptions.bundlePeerDependencies
                ]
            }
        ]);
    });

    test('buildAndPublish() rejects smoke check failures before publish', async function () {
        const smokePublishedArtifact = fake.rejects(new Error('artifact import failed'));
        const publish = fake.resolves(publishedToRegistry);
        const { processor } = createAutomaticBumpProcessor({
            verifyBundlePublishTarget: fake.resolves({
                alreadyPublished: false,
                publishedArtifacts: Maybe.nothing()
            }),
            smokePublishedArtifact,
            publish
        });

        await assert.rejects(async function () {
            await processor.buildAndPublish({
                analyzedBundle: createAnalyzedBundle(),
                buildOptions: createBuildAndPublishOptions(),
                stage: false
            });
        }, { message: 'artifact import failed' });
        assert.strictEqual(publish.callCount, 0);
    });

    test('tryBuildAndPublish() rejects pinned target version artifact collisions before publish', async function () {
        const versionedBundle = createVersionedBundle('package-a', '2.0.0');
        const verifyBundlePublishTarget = fake.rejects(
            new Error('Package "package-a" version "2.0.0" already exists with different artifacts')
        );
        const { processor } = createProcessor({
            determineCurrentVersion: fake.resolves(Maybe.nothing()),
            addVersion: fake.returns(versionedBundle),
            verifyBundlePublishTarget
        });

        await assert.rejects(async function () {
            await processor.tryBuildAndPublish({
                analyzedBundle: createAnalyzedBundle(),
                buildOptions: {
                    ...createBuildAndPublishOptions(),
                    versioning: { automatic: false, version: '2.0.0' }
                },
                stage: false
            });
        }, { message: 'Package "package-a" version "2.0.0" already exists with different artifacts' });
        assert.strictEqual(verifyBundlePublishTarget.callCount, 1);
    });

    test('tryBuildAndPublish() returns already-published when the exact latest target artifacts match', async function () {
        const smokePublishedArtifact = fake.rejects(new Error('should not smoke-check unchanged artifacts'));
        const { processor, rebuiltBundle } = createAutomaticBumpProcessor({
            verifyBundlePublishTarget: fake.resolves({
                alreadyPublished: true,
                publishedArtifacts: publishedArtifacts('1.2.4', 'published-head')
            }),
            smokePublishedArtifact
        });

        const result = await processor.tryBuildAndPublish({
            analyzedBundle: createAnalyzedBundle(),
            buildOptions: createBuildAndPublishOptions(),
            stage: false
        });

        assert.deepStrictEqual(result, {
            bundle: rebuiltBundle,
            status: 'already-published',
            publication: noPublication,
            extraFiles: [],
            previousReleaseArtifacts: publishedArtifacts('1.2.4', 'published-head')
        });
        assert.strictEqual(smokePublishedArtifact.callCount, 0);
    });

    test('tryBuildAndPublish() skips smoke checks when the latest registry package already matches', async function () {
        const smokePublishedArtifact = fake.rejects(new Error('should not smoke-check unchanged artifacts'));
        const { processor } = createProcessor({
            checkBundleAlreadyPublished: fake.resolves({
                alreadyPublishedAsLatest: true,
                previousReleaseArtifacts: Maybe.nothing()
            }),
            smokePublishedArtifact,
            verifyBundlePublishTarget: fake.rejects(new Error('should not verify unchanged artifacts'))
        });

        await processor.tryBuildAndPublish({
            analyzedBundle: createAnalyzedBundle(),
            buildOptions: createBuildAndPublishOptions(),
            stage: false
        });

        assert.strictEqual(smokePublishedArtifact.callCount, 0);
    });

    test('tryBuildAndPublish() passes generated extra files to exact target checks', async function () {
        const sbomFile = createTransferableFile('/sbom.cdx.json', 'sbom.cdx.json');
        const verifyBundlePublishTarget = fake.resolves({
            alreadyPublished: false,
            publishedArtifacts: Maybe.nothing()
        });
        const { processor, rebuiltBundle } = createAutomaticBumpProcessor({
            generateSbom: fake.resolves([ sbomFile ]),
            verifyBundlePublishTarget
        });

        await processor.tryBuildAndPublish({
            analyzedBundle: createAnalyzedBundle(),
            buildOptions: {
                ...createBuildAndPublishOptions(),
                publishSettings: { access: 'public', sbom: { enabled: true } }
            },
            stage: false
        });

        assert.deepStrictEqual(verifyBundlePublishTarget.firstCall.args, [
            {
                bundle: rebuiltBundle,
                registrySettings: { auth: { type: 'bearer-token', token: 'token' } },
                extraFiles: [ sbomFile ]
            }
        ]);
    });

    test('tryBuildAndPublish() skips exact target checks in stage mode', async function () {
        const verifyBundlePublishTarget = fake.rejects(new Error('should not verify staged targets'));
        const smokePublishedArtifact = fake.resolves(undefined);
        const { processor } = createAutomaticBumpProcessor({
            verifyBundlePublishTarget,
            smokePublishedArtifact
        });

        await processor.tryBuildAndPublish({
            analyzedBundle: createAnalyzedBundle(),
            buildOptions: createBuildAndPublishOptions(),
            stage: true
        });

        assert.strictEqual(verifyBundlePublishTarget.callCount, 0);
        assert.strictEqual(smokePublishedArtifact.callCount, 1);
    });
});
