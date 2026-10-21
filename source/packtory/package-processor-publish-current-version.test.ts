import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake } from 'sinon';
import { Maybe } from 'true-myth';
import type { VersionProviderInput } from '../configuration/manual-versioning-settings.ts';
import {
    createAnalyzedBundle,
    createBuildAndPublishOptions,
    createProcessor,
    createVersionedBundle
} from '../test-libraries/package-processor-test-support.ts';
import type { VersionedBundleWithManifest } from '../version-manager/versioned-bundle.ts';

type VersionedBundleInput = { readonly version: string; };

function stampBundleVersion(input: VersionedBundleInput): VersionedBundleWithManifest {
    return createVersionedBundle('package-a', input.version);
}

suite('package-processor publish current version', function () {
    for (const stage of [ false, true ]) {
        for (const currentVersion of [ undefined, '1.2.3' ]) {
            for (const automatic of [ false, true ]) {
                test(
                    `resolves once with stage=${stage}, currentVersion=${currentVersion}, automatic=${automatic}`,
                    async function () {
                        const versioning = automatic
                            ? { automatic: true as const, minimumVersion: '1.0.0' }
                            : { automatic: false as const, version: '1.0.0' };
                        const { processor, determineCurrentVersion, verifyBundlePublishTarget } = createProcessor({
                            determineCurrentVersion: fake.resolves(Maybe.of(currentVersion)),
                            addVersion: fake(stampBundleVersion)
                        });
                        const buildOptions = { ...createBuildAndPublishOptions(), versioning };
                        const expectedCurrentVersion = automatic ? '1.2.4' : '1.2.3';
                        const expectedVersion = currentVersion === undefined ? '1.0.0' : expectedCurrentVersion;

                        const result = await processor.tryBuildAndPublish({
                            analyzedBundle: createAnalyzedBundle(),
                            buildOptions,
                            stage
                        });

                        assert.deepStrictEqual(
                            [ determineCurrentVersion.callCount, determineCurrentVersion.firstCall.args ],
                            [ 1, [ {
                                name: 'package-a',
                                registrySettings: buildOptions.registrySettings,
                                stage,
                                versioning
                            } ] ]
                        );
                        assert.partialDeepStrictEqual(result, {
                            bundle: { version: expectedVersion },
                            status: currentVersion === undefined ? 'initial-version' : 'new-version'
                        });
                        assert.strictEqual(verifyBundlePublishTarget.callCount, stage ? 0 : 1);
                    }
                );
            }
        }
    }

    test('passes the staged current version to the provider without refreshing it', async function () {
        const provideVersion = fake.returns('1.2.4');
        const { processor, determineCurrentVersion, findCurrentHeadPublishedVersion } = createProcessor({
            determineCurrentVersion: fake.resolves(Maybe.just('1.2.3')),
            addVersion: fake(stampBundleVersion)
        });

        const result = await processor.tryBuildAndPublish({
            analyzedBundle: createAnalyzedBundle(),
            buildOptions: { ...createBuildAndPublishOptions(), versioning: { automatic: false, provideVersion } },
            stage: true
        });

        assert.strictEqual(result.bundle.version, '1.2.4');
        assert.strictEqual(determineCurrentVersion.callCount, 1);
        assert.strictEqual(findCurrentHeadPublishedVersion.callCount, 0);
        assert.strictEqual(provideVersion.callCount, 1);
        assert.partialDeepStrictEqual(provideVersion.firstCall.args, [ { currentVersion: '1.2.3', stage: true } ]);
    });

    test('resolves a fresh current version for each preparation attempt', async function () {
        const versions = [ '1.2.3', '1.2.4' ].values();
        const provideVersion = fake(function (input: VersionProviderInput) {
            return input.currentVersion ?? '0.0.1';
        });
        const { processor, determineCurrentVersion } = createProcessor({
            determineCurrentVersion: fake(async function () {
                return Maybe.of(versions.next().value);
            }),
            addVersion: fake(stampBundleVersion)
        });
        const options = {
            analyzedBundle: createAnalyzedBundle(),
            buildOptions: {
                ...createBuildAndPublishOptions(),
                versioning: { automatic: false as const, provideVersion }
            },
            stage: false
        };

        const first = await processor.tryBuildAndPublish(options);
        const second = await processor.tryBuildAndPublish(options);

        assert.deepStrictEqual([ first.bundle.version, second.bundle.version ], [ '1.2.3', '1.2.4' ]);
        assert.strictEqual(determineCurrentVersion.callCount, 2);
        assert.strictEqual(provideVersion.callCount, 2);
    });

    test('propagates lookup failures before invoking the provider or building artifacts', async function () {
        const failure = new Error('current version unavailable');
        const provideVersion = fake.returns('1.2.4');
        const { processor, addVersion, generateSoftwareBillOfMaterials } = createProcessor({
            determineCurrentVersion: fake.rejects(failure)
        });

        await assert.rejects(
            processor.tryBuildAndPublish({
                analyzedBundle: createAnalyzedBundle(),
                buildOptions: { ...createBuildAndPublishOptions(), versioning: { automatic: false, provideVersion } },
                stage: false
            }),
            failure
        );

        assert.strictEqual(provideVersion.callCount, 0);
        assert.strictEqual(addVersion.callCount, 0);
        assert.strictEqual(generateSoftwareBillOfMaterials.callCount, 0);
    });
});
