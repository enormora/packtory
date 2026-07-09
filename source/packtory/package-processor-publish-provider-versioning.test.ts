import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake, type SinonSpy } from 'sinon';
import { Maybe } from 'true-myth';
import {
    createAnalyzedBundle,
    createBuildAndPublishOptions,
    createProcessor,
    createVersionedBundle
} from '../test-libraries/package-processor-test-support.ts';
import type { BuildAndPublishOptions } from './map-config.ts';
import type { BuildAndPublishResult, DetermineVersionAndPublishOptions } from './package-processor.ts';

type VersionedBundleInput = { readonly version: string; };
type VersionedBundleBuilder = {
    readonly addVersion: SinonSpy;
    readonly versions: readonly string[];
};

function publishedArtifacts(version: string, gitHead: string): BuildAndPublishResult['previousReleaseArtifacts'] {
    return Maybe.just({
        version,
        publishedAt: undefined,
        gitHead,
        files: []
    });
}

function tryBuildOptions(versioning: BuildAndPublishOptions['versioning']): DetermineVersionAndPublishOptions {
    return {
        analyzedBundle: createAnalyzedBundle(),
        buildOptions: { ...createBuildAndPublishOptions(), versioning },
        stage: false
    };
}

function versionedBundleBuilder(): VersionedBundleBuilder {
    const versions: string[] = [];
    const addVersion = fake(function (input: VersionedBundleInput) {
        versions.push(input.version);
        return createVersionedBundle('package-a', input.version);
    });
    return { addVersion, versions };
}

suite('package-processor publish provider versioning', function () {
    test('checks provider-versioned packages at the current version before asking for a bump', async function () {
        const provideVersion = fake.returns('1.2.4');
        const currentVersionedBundle = createVersionedBundle('package-a', '1.2.3');
        const addVersion = fake.returns(currentVersionedBundle);
        const checkBundleAlreadyPublished = fake.resolves({
            alreadyPublishedAsLatest: true,
            previousReleaseArtifacts: publishedArtifacts('1.2.3', 'published-head')
        });
        const { processor } = createProcessor({
            determineCurrentVersion: fake.resolves(Maybe.just('1.2.3')),
            addVersion,
            checkBundleAlreadyPublished
        });

        const result = await processor.tryBuildAndPublish(tryBuildOptions({ automatic: false, provideVersion }));

        assert.deepStrictEqual(
            [ result.status, result.bundle.version, provideVersion.callCount, addVersion.callCount ],
            [ 'already-published', '1.2.3', 0, 1 ]
        );
        assert.deepStrictEqual(checkBundleAlreadyPublished.firstCall.args, [ {
            bundle: currentVersionedBundle,
            registrySettings: { auth: { type: 'bearer-token', token: 'token' } }
        } ]);
    });

    test('asks the provider for a new version when current artifacts changed', async function () {
        const provideVersion = fake.returns('1.2.4');
        const { addVersion, versions } = versionedBundleBuilder();
        const { processor } = createProcessor({
            determineCurrentVersion: fake.resolves(Maybe.just('1.2.3')),
            addVersion,
            checkBundleAlreadyPublished: fake.resolves({
                alreadyPublishedAsLatest: false,
                previousReleaseArtifacts: publishedArtifacts('1.2.3', 'published-head')
            })
        });

        const result = await processor.tryBuildAndPublish(tryBuildOptions({ automatic: false, provideVersion }));

        assert.deepStrictEqual([ result.status, result.bundle.version, provideVersion.callCount ], [
            'new-version',
            '1.2.4',
            1
        ]);
        assert.deepStrictEqual(versions, [ '1.2.3', '1.2.4' ]);
    });

    test('asks the provider directly when there is no current version to check', async function () {
        const { addVersion, versions } = versionedBundleBuilder();
        const determineCurrentVersion = fake.resolves(Maybe.nothing());
        const provideVersion = fake.returns('1.2.4');
        const versioning = {
            automatic: false as const,
            provideVersion
        };
        const { processor } = createProcessor({
            determineCurrentVersion,
            addVersion
        });

        await processor.tryBuildAndPublish(tryBuildOptions(versioning));

        assert.deepStrictEqual(versions, [ '1.2.4' ]);
        const expectedCurrentVersionLookup = [ {
            name: 'package-a',
            registrySettings: { auth: { type: 'bearer-token', token: 'token' } },
            stage: false,
            versioning
        } ];
        const actualCurrentVersionLookups = [
            determineCurrentVersion.firstCall.args,
            determineCurrentVersion.secondCall.args
        ];
        assert.deepStrictEqual(actualCurrentVersionLookups, [
            expectedCurrentVersionLookup,
            expectedCurrentVersionLookup
        ]);
    });
});
