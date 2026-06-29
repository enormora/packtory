import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake } from 'sinon';
import { Maybe } from 'true-myth';
import { noPublication } from '../bundle-emitter/publication-outcome.ts';
import {
    createAnalyzedBundle,
    createBuildAndPublishOptions,
    createLinkedBundle,
    createProcessor,
    createResolveOptions,
    createTransferableFile,
    createVersionedBundle,
    getCallArgs
} from '../test-libraries/package-processor-test-support.ts';
import type { DetermineVersionAndPublishOptions, PackageProcessor } from './package-processor.ts';

type TransformationInput = {
    readonly transformationsEnabled: boolean;
};

type DeadCodeEliminationInput<TDeadCodeElimination> = TransformationInput & {
    readonly deadCodeElimination?: TDeadCodeElimination;
};

function createDetermineVersionAndPublishOptions(): DetermineVersionAndPublishOptions {
    return {
        analyzedBundle: createAnalyzedBundle(),
        buildOptions: createBuildAndPublishOptions(),
        stage: false
    };
}

async function tryBuildAndPublishDefault(
    processor: PackageProcessor
): ReturnType<PackageProcessor['tryBuildAndPublish']> {
    return processor.tryBuildAndPublish(createDetermineVersionAndPublishOptions());
}

suite('package-processor', function () {
    test('resolveAndLink() emits progress events and links the resolved bundle with all dependency bundles', async function () {
        const linkedBundle = createLinkedBundle();
        const resolve = fake.resolves({
            name: 'package-a',
            contents: [],
            roots: { main: { js: createTransferableFile('/entry.js') } } as const,
            surface: { mode: 'implicit', defaultModuleRoot: 'main' } as const,
            externalDependencies: new Map()
        });
        const linkBundle = fake.resolves(linkedBundle);
        const { processor, emit } = createProcessor({ resolve, linkBundle });

        const options = createResolveOptions();
        const result = await processor.resolveAndLink(options);

        assert.strictEqual(result, linkedBundle);
        assert.deepStrictEqual(resolve.firstCall.args, [ options ]);
        assert.deepStrictEqual(linkBundle.firstCall.args, [
            {
                bundle: {
                    name: 'package-a',
                    contents: [],
                    roots: { main: { js: createTransferableFile('/entry.js') } },
                    surface: { mode: 'implicit', defaultModuleRoot: 'main' },
                    externalDependencies: new Map()
                },
                bundleDependencies: [ ...options.bundleDependencies, ...options.bundlePeerDependencies ]
            }
        ]);
        assert.deepStrictEqual(getCallArgs(emit), [
            [ 'resolving', { packageName: 'package-a' } ],
            [ 'linking', { packageName: 'package-a' } ]
        ]);
    });

    test('build() resolves, links, runs the dead-code eliminator, and forwards to versionManager.addVersion()', async function () {
        const linkedBundle = createLinkedBundle();
        const linkBundle = fake.resolves(linkedBundle);
        const addVersion = fake.returns(createVersionedBundle());
        const { processor, addVersion: addVersionSpy } = createProcessor({ linkBundle, addVersion });

        const result = await processor.build({
            ...createBuildAndPublishOptions(),
            version: '3.4.5'
        });

        assert.strictEqual(result.packageJson.version, '1.2.3');
        assert.deepStrictEqual(addVersionSpy.firstCall.args, [
            {
                bundle: { ...linkedBundle, contents: [], sideEffectsField: undefined },
                version: '3.4.5',
                mainPackageJson: { type: 'module', dependencies: { dep: '^1.0.0' } },
                bundleDependencies: [ createVersionedBundle('bundle-dependency', '1.0.0') ],
                bundlePeerDependencies: [ createVersionedBundle('peer-dependency', '2.0.0') ],
                additionalPackageJsonAttributes: { publishConfig: { access: 'public' } },
                allowMutableSpecifiers: []
            }
        ]);
    });

    test('build() forwards deadCodeElimination settings to the eliminator', async function () {
        const eliminate = fake(
            async function (
                inputs: readonly DeadCodeEliminationInput<unknown>[]
            ) {
                return inputs.map(function (entry) {
                    return {
                        ...createLinkedBundle(),
                        contents: [],
                        sideEffectsField: undefined,
                        transformationsEnabledFlag: entry.transformationsEnabled
                    };
                });
            }
        );
        const { processor } = createProcessor({ eliminate });
        const deadCodeElimination = { enabled: false, pureConstructors: [ 'Set' ] } as const;

        await processor.build({
            ...createBuildAndPublishOptions(),
            version: '1.0.0',
            deadCodeElimination
        });

        const eliminationInputs = eliminate.firstCall.args[0] as readonly DeadCodeEliminationInput<
            typeof deadCodeElimination
        >[];
        const firstInput = eliminationInputs[0];
        if (firstInput === undefined) {
            assert.fail('expected elimination input');
        }
        assert.strictEqual(firstInput.transformationsEnabled, false);
        assert.deepStrictEqual(firstInput.deadCodeElimination, deadCodeElimination);
    });

    test('build() defaults transformationsEnabled to true when deadCodeElimination is not configured', async function () {
        const eliminate = fake(async function (inputs: readonly TransformationInput[]) {
            return inputs.map(function () {
                return { ...createLinkedBundle(), contents: [], sideEffectsField: undefined };
            });
        });
        const { processor } = createProcessor({ eliminate });

        await processor.build({ ...createBuildAndPublishOptions(), version: '1.0.0' });

        const eliminationInputs = eliminate.firstCall.args[0];
        const firstInput = eliminationInputs[0];
        if (firstInput === undefined) {
            assert.fail('expected elimination input');
        }
        assert.strictEqual(firstInput.transformationsEnabled, true);
    });

    test('build() throws when the dead-code eliminator returns no bundle', async function () {
        const eliminate = fake.resolves([]);
        const { processor } = createProcessor({ eliminate });

        try {
            await processor.build({
                ...createBuildAndPublishOptions(),
                version: '3.4.5'
            });
            assert.fail('Expected processor.build() should fail but it did not');
        } catch (error: unknown) {
            assert.strictEqual((error as Error).message, 'Dead code eliminator returned no bundle for "package-a"');
        }
    });

    test('tryBuildAndPublish() returns already-published when the emitted bundle already matches the latest version', async function () {
        const versionedBundle = createVersionedBundle('package-a', '0.0.0');
        const checkBundleAlreadyPublished = fake.resolves({
            alreadyPublishedAsLatest: true,
            previousReleaseArtifacts: Maybe.nothing()
        });
        const { processor, increaseVersion, emit } = createProcessor({
            addVersion: fake.returns(versionedBundle),
            checkBundleAlreadyPublished
        });

        const result = await processor.tryBuildAndPublish({
            analyzedBundle: createAnalyzedBundle(),
            buildOptions: createBuildAndPublishOptions(),
            stage: false
        });

        assert.deepStrictEqual(result, {
            bundle: versionedBundle,
            status: 'already-published',
            publication: noPublication,
            extraFiles: [],
            previousReleaseArtifacts: Maybe.nothing()
        });
        assert.strictEqual(increaseVersion.callCount, 0);
        assert.deepStrictEqual(checkBundleAlreadyPublished.firstCall.args, [
            {
                bundle: versionedBundle,
                registrySettings: { auth: { type: 'bearer-token', token: 'token' } }
            }
        ]);
        assert.deepStrictEqual(getCallArgs(emit), [ [ 'building', { packageName: 'package-a', version: '0.0.0' } ] ]);
    });

    test('tryBuildAndPublish() rebuilds with an increased version for the first publish', async function () {
        const initialBundle = createVersionedBundle('package-a', '0.0.0');
        const rebuiltBundle = createVersionedBundle('package-a', '0.0.1');
        const determineCurrentVersion = fake.resolves(Maybe.nothing());
        const { processor, emit } = createProcessor({
            determineCurrentVersion,
            addVersion: fake.returns(initialBundle),
            increaseVersion: fake.returns(rebuiltBundle)
        });

        const result = await tryBuildAndPublishDefault(processor);

        assert.deepStrictEqual(result, {
            bundle: rebuiltBundle,
            status: 'initial-version',
            publication: noPublication,
            extraFiles: [],
            previousReleaseArtifacts: Maybe.nothing()
        });
        assert.deepStrictEqual(determineCurrentVersion.firstCall.args, [
            {
                name: 'package-a',
                registrySettings: { auth: { type: 'bearer-token', token: 'token' } },
                stage: false,
                versioning: { automatic: true }
            }
        ]);
        assert.deepStrictEqual(getCallArgs(emit), [
            [ 'building', { packageName: 'package-a', version: '0.0.0' } ],
            [ 'rebuilding', { packageName: 'package-a', version: '0.0.0' } ]
        ]);
    });
});
