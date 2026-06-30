import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake } from 'sinon';
import { Maybe } from 'true-myth';
import { noPublication } from '../bundle-emitter/publication-outcome.ts';
import {
    createAnalyzedBundle,
    createAnalyzedResource,
    createBuildAndPublishOptions,
    createProcessor,
    createVersionedBundle,
    getCallArgs,
    tryBuildAndPublishDefault
} from '../test-libraries/package-processor-test-support.ts';
import type { BuildAndPublishOptions } from './map-config.ts';
import type { PackageProcessor } from './package-processor.ts';

async function tryBuildAndPublishWithVersioning(
    processor: PackageProcessor,
    versioning: BuildAndPublishOptions['versioning']
): ReturnType<PackageProcessor['tryBuildAndPublish']> {
    return processor.tryBuildAndPublish({
        analyzedBundle: createAnalyzedBundle(),
        buildOptions: { ...createBuildAndPublishOptions(), versioning },
        stage: false
    });
}

function assertNoPublicationResult(
    result: Awaited<ReturnType<PackageProcessor['tryBuildAndPublish']>>,
    bundle: unknown,
    status: 'initial-version' | 'new-version'
): void {
    assert.deepStrictEqual(result, {
        bundle,
        status,
        publication: noPublication,
        extraFiles: [],
        previousReleaseArtifacts: Maybe.nothing()
    });
}

suite('package-processor versioning', function () {
    test('tryBuildAndPublish() returns new-version when the package already has a published version', async function () {
        const initialBundle = createVersionedBundle('package-a', '2.0.0');
        const rebuiltBundle = createVersionedBundle('package-a', '2.0.1');
        const { processor } = createProcessor({
            determineCurrentVersion: fake.resolves(Maybe.just('2.0.0')),
            addVersion: fake.returns(initialBundle),
            increaseVersion: fake.returns(rebuiltBundle)
        });

        const result = await tryBuildAndPublishDefault(processor);

        assertNoPublicationResult(result, rebuiltBundle, 'new-version');
    });

    test('tryBuildAndPublish() keeps the configured manual version without rebuilding on the initial publish', async function () {
        const manualBundle = createVersionedBundle('package-a', '4.5.6');
        const { processor, increaseVersion, emit } = createProcessor({
            determineCurrentVersion: fake.resolves(Maybe.nothing()),
            addVersion: fake.returns(manualBundle)
        });

        const buildOptions: BuildAndPublishOptions = {
            ...createBuildAndPublishOptions(),
            versioning: { automatic: false, version: '4.5.6' }
        };
        const result = await processor.tryBuildAndPublish({
            analyzedBundle: createAnalyzedBundle(),
            buildOptions,
            stage: false
        });

        assertNoPublicationResult(result, manualBundle, 'initial-version');
        assert.strictEqual(increaseVersion.callCount, 0);
        assert.deepStrictEqual(getCallArgs(emit), [ [ 'building', { packageName: 'package-a', version: '4.5.6' } ] ]);
    });

    test('tryBuildAndPublish() keeps the current published version without rebuilding when automatic versioning is disabled', async function () {
        const currentBundle = createVersionedBundle('package-a', '2.0.0');
        const { processor, increaseVersion, emit } = createProcessor({
            determineCurrentVersion: fake.resolves(Maybe.just('2.0.0')),
            addVersion: fake.returns(currentBundle)
        });

        const result = await tryBuildAndPublishWithVersioning(processor, { automatic: false, version: '9.9.9' });

        assertNoPublicationResult(result, currentBundle, 'new-version');
        assert.strictEqual(increaseVersion.callCount, 0);
        assert.deepStrictEqual(getCallArgs(emit), [ [ 'building', { packageName: 'package-a', version: '2.0.0' } ] ]);
    });

    test('tryBuildAndPublish() uses minimumVersion for the first automatic publish without rebuilding', async function () {
        const minimumVersionBundle = createVersionedBundle('package-a', '1.2.3');
        const { processor, increaseVersion, emit } = createProcessor({
            determineCurrentVersion: fake.resolves(Maybe.nothing()),
            addVersion: fake.returns(minimumVersionBundle)
        });

        const result = await tryBuildAndPublishWithVersioning(processor, {
            automatic: true,
            minimumVersion: '1.2.3'
        });

        assertNoPublicationResult(result, minimumVersionBundle, 'initial-version');
        assert.strictEqual(increaseVersion.callCount, 0);
        assert.deepStrictEqual(getCallArgs(emit), [ [ 'building', { packageName: 'package-a', version: '1.2.3' } ] ]);
    });

    test('tryBuildAndPublish() forwards the fully built addVersion payload before publication checks', async function () {
        const addVersion = fake.returns(createVersionedBundle('package-a', '1.2.3'));
        const checkBundleAlreadyPublished = fake.resolves({
            alreadyPublishedAsLatest: false,
            previousReleaseArtifacts: Maybe.nothing()
        });
        const { processor } = createProcessor({
            determineCurrentVersion: fake.resolves(Maybe.just('1.2.3')),
            addVersion,
            checkBundleAlreadyPublished
        });

        const analyzedBundle = createAnalyzedBundle();
        const buildOptions = createBuildAndPublishOptions();
        await processor.tryBuildAndPublish({ analyzedBundle, buildOptions, stage: false });

        assert.deepStrictEqual(addVersion.firstCall.args, [
            {
                bundle: analyzedBundle,
                ...buildOptions,
                version: '1.2.3',
                substitutionPublicModuleSourcePaths: undefined
            }
        ]);
    });

    test('tryBuildAndPublish() passes calculated attribution files to manual version providers', async function () {
        const providerInputs: unknown[] = [];
        const { processor } = createProcessor({ repositoryFolder: '/repo' });
        const analyzedBundle = createAnalyzedBundle();
        const buildOptions: BuildAndPublishOptions = {
            ...createBuildAndPublishOptions(),
            ignoredAttributionPaths: [ 'CHANGELOG.md' ],
            versioning: {
                automatic: false,
                async provideVersion(input) {
                    providerInputs.push(input);
                    return '1.2.3';
                }
            }
        };

        const result = await processor.tryBuildAndPublish({
            analyzedBundle: {
                ...analyzedBundle,
                contents: [
                    createAnalyzedResource('/repo/source/index.js'),
                    createAnalyzedResource('/repo/docs/readme.md', 'readme.md')
                ]
            },
            buildOptions,
            stage: true
        });

        assert.deepStrictEqual(providerInputs, [
            {
                packageName: 'package-a',
                currentVersion: undefined,
                targetSourceFiles: [ 'docs/readme.md', 'package.json', 'source/index.js' ],
                ignoredAttributionPaths: [ 'CHANGELOG.md' ],
                registrySettings: { auth: { type: 'bearer-token', token: 'token' } },
                stage: true
            }
        ]);
        assert.strictEqual(result.bundle.version, '1.2.3');
    });

    test('tryBuildAndPublish() keeps the configured manual version without rebuilding on a rerun', async function () {
        const manualBundle = createVersionedBundle('package-a', '3.2.1');
        const { processor, increaseVersion, emit } = createProcessor({
            determineCurrentVersion: fake.resolves(Maybe.just('3.2.1')),
            addVersion: fake.returns(manualBundle)
        });

        const result = await tryBuildAndPublishWithVersioning(processor, { automatic: false, version: '3.2.1' });

        assertNoPublicationResult(result, manualBundle, 'new-version');
        assert.strictEqual(increaseVersion.callCount, 0);
        assert.deepStrictEqual(getCallArgs(emit), [ [ 'building', { packageName: 'package-a', version: '3.2.1' } ] ]);
    });
});
