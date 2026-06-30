import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake, type SinonSpy } from 'sinon';
import { Maybe } from 'true-myth';
import { noPublication, publishedToRegistry, stagedForApproval } from '../bundle-emitter/publication-outcome.ts';
import type { AnalyzedBundle } from '../dead-code-eliminator/analyzed-bundle.ts';
import type { VersionedBundleWithManifest } from '../version-manager/versioned-bundle.ts';
import type { BuildAndPublishOptions } from './map-config.ts';
import type {
    BuildAndPublishResult,
    DetermineVersionAndPublishOptions,
    PackageProcessor
} from './package-processor.ts';
import {
    createAnalyzedBundle,
    createBuildAndPublishOptions,
    createProcessor,
    createTransferableFile,
    createVersionedBundle,
    getCallArgs,
    type TransferableFile
} from './package-processor-test-support.ts';

type SbomResult = readonly TransferableFile[] | undefined;

type SbomScenario = {
    readonly bundle: VersionedBundleWithManifest;
    readonly analyzedBundle: AnalyzedBundle;
    readonly generateSbom: SinonSpy;
    readonly checkBundleAlreadyPublished: SinonSpy;
    readonly processor: PackageProcessor;
};

suite('package-processor publish', function () {
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
        assert.deepStrictEqual(getCallArgs(emit), [ [ 'building', { packageName: 'package-a', version: '1.2.3' } ] ]);
    });

    test('buildAndPublish() publishes the rebuilt bundle and emits publishing progress', async function () {
        const rebuiltBundle = createVersionedBundle('package-a', '1.2.4');
        const publish = fake.resolves(publishedToRegistry);
        const { processor, emit } = createProcessor({
            determineCurrentVersion: fake.resolves(Maybe.just('1.2.3')),
            addVersion: fake.returns(createVersionedBundle('package-a', '1.2.3')),
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
        const checkArgs = checkBundleAlreadyPublished.firstCall.args[0] as { readonly extraFiles: readonly unknown[]; };
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
