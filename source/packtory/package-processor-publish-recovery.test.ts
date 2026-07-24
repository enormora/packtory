import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake, type SinonSpy } from 'sinon';
import { Maybe } from 'true-myth';
import { publishedToRegistry } from '../bundle-emitter/publication-outcome.ts';
import {
    createAnalyzedBundle,
    createBuildAndPublishOptions,
    createProcessor,
    createVersionedBundle
} from '../test-libraries/package-processor-test-support.ts';
import type {
    BuildAndPublishResult,
    DetermineVersionAndPublishOptions,
    PackageProcessor
} from './package-processor.ts';

type ConfirmedPublishScenario = {
    readonly checkBundleAlreadyPublished: SinonSpy;
    readonly findCurrentHeadPublishedVersion: SinonSpy;
    readonly processor: PackageProcessor;
    readonly publishFailure: Error;
    readonly rebuiltBundle: BuildAndPublishResult['bundle'];
};
type FailedRecoveryOverrides = {
    readonly checkBundleAlreadyPublished?: SinonSpy;
    readonly findCurrentHeadPublishedVersion?: SinonSpy;
    readonly stage?: boolean;
};

function publishedArtifacts(version: string, gitHead: string): BuildAndPublishResult['previousReleaseArtifacts'] {
    return Maybe.just({
        version,
        publishedAt: undefined,
        gitHead,
        files: []
    });
}

function publishOptions(stage = false): DetermineVersionAndPublishOptions {
    return {
        analyzedBundle: createAnalyzedBundle(),
        buildOptions: createBuildAndPublishOptions(),
        stage
    };
}

function createPostPublishArtifactChecks(): () => Promise<{
    readonly alreadyPublishedAsLatest: boolean;
    readonly previousReleaseArtifacts: BuildAndPublishResult['previousReleaseArtifacts'];
}> {
    let attempt = 0;
    return async function () {
        attempt += 1;
        return attempt === 1
            ? { alreadyPublishedAsLatest: false, previousReleaseArtifacts: Maybe.nothing() }
            : {
                alreadyPublishedAsLatest: true,
                previousReleaseArtifacts: publishedArtifacts('1.2.4', 'current-head')
            };
    };
}

function createPostPublishCurrentHeadLookups(): () => Promise<
    {
        readonly gitHead: string;
        readonly version: string;
    } | undefined
> {
    let attempt = 0;
    return async function () {
        attempt += 1;
        return attempt === 1 ? undefined : { version: '1.2.4', gitHead: 'current-head' };
    };
}

function createConfirmedPublishScenario(): ConfirmedPublishScenario {
    const rebuiltBundle = createVersionedBundle('package-a', '1.2.4');
    const publishFailure = new Error('transparency log duplicate');
    const checkBundleAlreadyPublished = fake(createPostPublishArtifactChecks());
    const findCurrentHeadPublishedVersion = fake(createPostPublishCurrentHeadLookups());
    const { processor } = createProcessor({
        determineCurrentVersion: fake.resolves(Maybe.just('1.2.3')),
        findCurrentHeadPublishedVersion,
        addVersion: fake.returns(createVersionedBundle('package-a', '1.2.3')),
        increaseVersion: fake.returns(rebuiltBundle),
        checkBundleAlreadyPublished,
        publish: fake.rejects(publishFailure)
    });
    return { checkBundleAlreadyPublished, findCurrentHeadPublishedVersion, processor, publishFailure, rebuiltBundle };
}

function createUnconfirmedPublishProcessor(
    publishFailure: Error,
    overrides: FailedRecoveryOverrides = {}
): PackageProcessor {
    const processorOverrides = {
        determineCurrentVersion: fake.resolves(Maybe.just('1.2.3')),
        findCurrentHeadPublishedVersion: overrides.findCurrentHeadPublishedVersion ?? fake.resolves(undefined),
        addVersion: fake.returns(createVersionedBundle('package-a', '1.2.3')),
        increaseVersion: fake.returns(createVersionedBundle('package-a', '1.2.4')),
        publish: fake.rejects(publishFailure),
        ...overrides.checkBundleAlreadyPublished === undefined
            ? {}
            : { checkBundleAlreadyPublished: overrides.checkBundleAlreadyPublished }
    };
    return createProcessor(processorOverrides).processor;
}

async function expectOriginalPublishFailure(
    publishFailure: Error,
    overrides: FailedRecoveryOverrides = {}
): Promise<void> {
    await assert.rejects(
        createUnconfirmedPublishProcessor(publishFailure, overrides)
            .buildAndPublish(publishOptions(overrides.stage ?? false)),
        publishFailure
    );
}

suite('package-processor publish recovery', function () {
    test('buildAndPublish() returns success when a failed publish is visible in the registry', async function () {
        const scenario = createConfirmedPublishScenario();

        const result = await scenario.processor.buildAndPublish(publishOptions());

        assert.deepStrictEqual(result, {
            bundle: scenario.rebuiltBundle,
            status: 'new-version',
            publication: publishedToRegistry,
            extraFiles: [],
            previousReleaseArtifacts: publishedArtifacts('1.2.4', 'current-head')
        });
        assert.deepStrictEqual(
            {
                checkBundleAlreadyPublished: scenario.checkBundleAlreadyPublished.callCount,
                findCurrentHeadPublishedVersion: scenario.findCurrentHeadPublishedVersion.callCount
            },
            { checkBundleAlreadyPublished: 2, findCurrentHeadPublishedVersion: 2 }
        );
    });

    test('buildAndPublish() rethrows publish errors when the registry does not confirm the package', async function () {
        const publishFailure = new Error('transparency log duplicate');

        await expectOriginalPublishFailure(publishFailure);
    });

    test('buildAndPublish() skips registry recovery in staged publishing mode', async function () {
        const findCurrentHeadPublishedVersion = fake.rejects(new Error('must not inspect latest'));

        await expectOriginalPublishFailure(new Error('staged publish failed'), {
            findCurrentHeadPublishedVersion,
            stage: true
        });

        assert.strictEqual(findCurrentHeadPublishedVersion.callCount, 0);
    });

    test('buildAndPublish() rethrows publish errors when current-head lookup fails', async function () {
        let attempt = 0;
        const findCurrentHeadPublishedVersion = fake(async function () {
            attempt += 1;
            if (attempt === 1) {
                return undefined;
            }
            throw new Error('registry metadata unavailable');
        });

        await assert.rejects(
            createUnconfirmedPublishProcessor(new Error('publish failed'), { findCurrentHeadPublishedVersion })
                .buildAndPublish(publishOptions()),
            { message: 'registry metadata unavailable' }
        );
    });

    test('buildAndPublish() rethrows publish errors when current-head version differs', async function () {
        const checkBundleAlreadyPublished = fake.resolves({
            alreadyPublishedAsLatest: false,
            previousReleaseArtifacts: Maybe.nothing()
        });
        let attempt = 0;

        await expectOriginalPublishFailure(new Error('publish failed'), {
            checkBundleAlreadyPublished,
            findCurrentHeadPublishedVersion: fake(async function () {
                attempt += 1;
                return attempt === 1
                    ? undefined
                    : { version: '1.2.5', gitHead: 'current-head' };
            })
        });

        assert.strictEqual(checkBundleAlreadyPublished.callCount, 1);
    });

    test('buildAndPublish() skips artifact recovery checks when current-head metadata is missing', async function () {
        let attempt = 0;
        const checkBundleAlreadyPublished = fake(async function () {
            attempt += 1;
            if (attempt === 1) {
                return { alreadyPublishedAsLatest: false, previousReleaseArtifacts: Maybe.nothing() };
            }
            throw new Error('must not inspect artifacts');
        });

        await expectOriginalPublishFailure(new Error('publish failed'), { checkBundleAlreadyPublished });

        assert.strictEqual(checkBundleAlreadyPublished.callCount, 1);
    });

    test('buildAndPublish() checks recovery against the attempted package name and registry', async function () {
        const scenario = createConfirmedPublishScenario();

        await scenario.processor.buildAndPublish(publishOptions());

        assert.deepStrictEqual(scenario.findCurrentHeadPublishedVersion.secondCall.args, [
            {
                name: 'package-a',
                registrySettings: { auth: { type: 'bearer-token', token: 'token' } }
            }
        ]);
    });

    test('buildAndPublish() rethrows publish errors when recovered artifacts differ', async function () {
        let attempt = 0;
        await expectOriginalPublishFailure(new Error('publish failed'), {
            checkBundleAlreadyPublished: fake(async function () {
                attempt += 1;
                return {
                    alreadyPublishedAsLatest: false,
                    previousReleaseArtifacts: attempt === 1
                        ? Maybe.nothing()
                        : publishedArtifacts('1.2.4', 'current-head')
                };
            }),
            findCurrentHeadPublishedVersion: fake.resolves({ version: '1.2.4', gitHead: 'current-head' })
        });
    });

    test('buildAndPublish() rethrows publish errors when recovered artifacts cannot be read', async function () {
        let attempt = 0;
        let currentHeadAttempt = 0;
        await assert.rejects(
            createUnconfirmedPublishProcessor(new Error('publish failed'), {
                checkBundleAlreadyPublished: fake(async function () {
                    attempt += 1;
                    if (attempt === 1) {
                        return { alreadyPublishedAsLatest: false, previousReleaseArtifacts: Maybe.nothing() };
                    }
                    throw new Error('artifact read failed');
                }),
                findCurrentHeadPublishedVersion: fake(async function () {
                    currentHeadAttempt += 1;
                    return currentHeadAttempt === 1
                        ? undefined
                        : { version: '1.2.4', gitHead: 'current-head' };
                })
            })
                .buildAndPublish(publishOptions()),
            { message: 'artifact read failed' }
        );
    });
});
