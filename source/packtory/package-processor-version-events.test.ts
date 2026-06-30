import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake, type SinonSpy } from 'sinon';
import { Maybe } from 'true-myth';
import {
    createAnalyzedBundle,
    createBuildAndPublishOptions,
    createProcessor,
    createVersionedBundle,
    getCallArgs,
    tryBuildAndPublishDefault
} from '../test-libraries/package-processor-test-support.ts';
import type { DetermineVersionAndPublishOptions } from './package-processor.ts';

type VersionDeterminedPayload = {
    readonly packageName: string;
    readonly previousVersion: string | undefined;
    readonly chosenVersion: string;
    readonly trigger: 'auto-patch-bump' | 'initial' | 'minimum' | 'pinned';
};

function onlyVersionDeterminedSubscriber(): SinonSpy {
    return fake(function (eventName: string) {
        return eventName === 'versionDetermined';
    });
}

function filterVersionDetermined(emit: SinonSpy): unknown[][] {
    return getCallArgs(emit).filter(function (args) {
        return args[0] === 'versionDetermined';
    });
}

function expectSingleVersionDetermined(emit: SinonSpy, payload: VersionDeterminedPayload): void {
    assert.deepStrictEqual(filterVersionDetermined(emit), [ [ 'versionDetermined', payload ] ]);
}

function checkBundleAlreadyPublishedAsLatest(): SinonSpy {
    return fake.resolves({
        alreadyPublishedAsLatest: true,
        previousReleaseArtifacts: Maybe.nothing()
    });
}

suite('package-processor version events', function () {
    test('tryBuildAndPublish() emits versionDetermined trigger "pinned" when first publish keeps the manual version', async function () {
        const manualBundle = createVersionedBundle('package-a', '4.5.6');
        const { processor, emit } = createProcessor({
            hasSubscribers: onlyVersionDeterminedSubscriber(),
            determineCurrentVersion: fake.resolves(Maybe.nothing()),
            addVersion: fake.returns(manualBundle)
        });

        await processor.tryBuildAndPublish({
            analyzedBundle: createAnalyzedBundle(),
            buildOptions: { ...createBuildAndPublishOptions(), versioning: { automatic: false, version: '4.5.6' } },
            stage: false
        });

        expectSingleVersionDetermined(emit, {
            packageName: 'package-a',
            previousVersion: undefined,
            chosenVersion: '4.5.6',
            trigger: 'pinned'
        });
    });

    test('tryBuildAndPublish() emits versionDetermined trigger "auto-patch-bump" on first auto publish without minimum', async function () {
        const initialBundle = createVersionedBundle('package-a', '0.0.0');
        const rebuiltBundle = createVersionedBundle('package-a', '0.0.1');
        const { processor, emit } = createProcessor({
            hasSubscribers: onlyVersionDeterminedSubscriber(),
            determineCurrentVersion: fake.resolves(Maybe.nothing()),
            addVersion: fake.returns(initialBundle),
            increaseVersion: fake.returns(rebuiltBundle)
        });

        await tryBuildAndPublishDefault(processor);

        expectSingleVersionDetermined(emit, {
            packageName: 'package-a',
            previousVersion: undefined,
            chosenVersion: '0.0.1',
            trigger: 'auto-patch-bump'
        });
    });

    test('tryBuildAndPublish() emits versionDetermined trigger "minimum" when minimumVersion is used as-is', async function () {
        const minimumVersionBundle = createVersionedBundle('package-a', '1.2.3');
        const { processor, emit } = createProcessor({
            hasSubscribers: onlyVersionDeterminedSubscriber(),
            determineCurrentVersion: fake.resolves(Maybe.nothing()),
            addVersion: fake.returns(minimumVersionBundle)
        });

        await processor.tryBuildAndPublish({
            analyzedBundle: createAnalyzedBundle(),
            buildOptions: {
                ...createBuildAndPublishOptions(),
                versioning: { automatic: true, minimumVersion: '1.2.3' }
            },
            stage: false
        });

        expectSingleVersionDetermined(emit, {
            packageName: 'package-a',
            previousVersion: undefined,
            chosenVersion: '1.2.3',
            trigger: 'minimum'
        });
    });

    test('tryBuildAndPublish() emits versionDetermined with the previousVersion for a rebuild on existing publication', async function () {
        const currentBundle = createVersionedBundle('package-a', '2.0.0');
        const rebuilt = createVersionedBundle('package-a', '2.0.1');
        const { processor, emit } = createProcessor({
            hasSubscribers: onlyVersionDeterminedSubscriber(),
            determineCurrentVersion: fake.resolves(Maybe.just('2.0.0')),
            addVersion: fake.returns(currentBundle),
            increaseVersion: fake.returns(rebuilt)
        });

        await tryBuildAndPublishDefault(processor);

        expectSingleVersionDetermined(emit, {
            packageName: 'package-a',
            previousVersion: '2.0.0',
            chosenVersion: '2.0.1',
            trigger: 'auto-patch-bump'
        });
    });

    test('tryBuildAndPublish() emits versionDetermined trigger "auto-patch-bump" without bump when current matches an automatic build', async function () {
        const initialBundle = createVersionedBundle('package-a', '2.0.0');
        const { processor, emit } = createProcessor({
            hasSubscribers: onlyVersionDeterminedSubscriber(),
            determineCurrentVersion: fake.resolves(Maybe.just('2.0.0')),
            addVersion: fake.returns(initialBundle),
            checkBundleAlreadyPublished: checkBundleAlreadyPublishedAsLatest()
        });

        await tryBuildAndPublishDefault(processor);

        expectSingleVersionDetermined(emit, {
            packageName: 'package-a',
            previousVersion: '2.0.0',
            chosenVersion: '2.0.0',
            trigger: 'auto-patch-bump'
        });
    });

    test('tryBuildAndPublish() emits versionDetermined trigger "initial" when nothing is published and the bundle already matches', async function () {
        const initialBundle = createVersionedBundle('package-a', '0.0.0');
        const { processor, emit } = createProcessor({
            hasSubscribers: onlyVersionDeterminedSubscriber(),
            determineCurrentVersion: fake.resolves(Maybe.nothing()),
            addVersion: fake.returns(initialBundle),
            checkBundleAlreadyPublished: checkBundleAlreadyPublishedAsLatest()
        });

        await tryBuildAndPublishDefault(processor);

        expectSingleVersionDetermined(emit, {
            packageName: 'package-a',
            previousVersion: undefined,
            chosenVersion: '0.0.0',
            trigger: 'initial'
        });
    });

    test('tryBuildAndPublish() does NOT emit versionDetermined when no subscriber is registered', async function () {
        const { processor, emit } = createProcessor({
            determineCurrentVersion: fake.resolves(Maybe.just('1.2.3')),
            addVersion: fake.returns(createVersionedBundle('package-a', '1.2.3')),
            checkBundleAlreadyPublished: fake.resolves({
                alreadyPublishedAsLatest: true,
                previousReleaseArtifacts: Maybe.nothing()
            })
        });

        await tryBuildAndPublishDefault(processor);

        assert.strictEqual(filterVersionDetermined(emit).length, 0);
    });

    test('buildAndPublish() forwards extraFiles from sbomFileBuilder to publish', async function () {
        const rebuiltBundle = createVersionedBundle('package-a', '1.2.4');
        const publish = fake.resolves(undefined);
        const generateSbom = fake.resolves([
            { filePath: 'sbom.cdx.json', content: '{"sbom":"stub"}', isExecutable: false }
        ]);
        const { processor } = createProcessor({
            determineCurrentVersion: fake.resolves(Maybe.just('1.2.3')),
            addVersion: fake.returns(createVersionedBundle('package-a', '1.2.3')),
            increaseVersion: fake.returns(rebuiltBundle),
            publish,
            generateSbom
        });

        const options: DetermineVersionAndPublishOptions = {
            analyzedBundle: createAnalyzedBundle(),
            buildOptions: { ...createBuildAndPublishOptions(), publishSettings: { access: 'public' } },
            stage: false
        };
        await processor.buildAndPublish(options);

        const publishArgs = publish.firstCall.args[0] as { readonly extraFiles: readonly unknown[]; };
        assert.deepStrictEqual(publishArgs.extraFiles, [
            { filePath: 'sbom.cdx.json', content: '{"sbom":"stub"}', isExecutable: false }
        ]);
    });
});
