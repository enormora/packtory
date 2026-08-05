import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake, type SinonSpy } from 'sinon';
import type { AnalyzedBundle, DeadCodeEliminator } from '../dead-code-eliminator/analyzed-bundle.ts';
import type { LinkedBundle } from '../linker/linked-bundle.ts';
import type { ProgressBroadcastProvider } from '../progress/progress-broadcaster.ts';
import type { VersionedBundleWithManifest } from '../version-manager/versioned-bundle.ts';
import {
    createAnalyzedBundle,
    createBuildAndPublishOptions,
    createLinkedBundle,
    createResolveOptions,
    createVersionedBundle,
    getCallArgs
} from '../test-libraries/package-processor-test-support.ts';
import type { BuildOptions, ResolveAndLinkOptions } from './map-config.ts';
import {
    createResolveAndBuildOperations,
    type ResolveAndBuildDependencies,
    type ResolveAndBuildOperations
} from './package-processor-build.ts';

type InvalidMainPackageJson = {
    readonly type: string;
};

type EmitArguments = Parameters<ProgressBroadcastProvider['emit']>;

type PipelineDependenciesFixture = {
    readonly analyzedBundle: AnalyzedBundle;
    readonly addVersion: SinonSpy;
    readonly dependencies: ResolveAndBuildDependencies;
    readonly eliminate: SinonSpy;
    readonly emit: SinonSpy;
    readonly linkBundle: SinonSpy;
    readonly linkedBundle: LinkedBundle;
    readonly resolve: SinonSpy;
    readonly versionedBundle: VersionedBundleWithManifest;
};

type PipelineSpies = {
    readonly analyzedBundle: AnalyzedBundle;
    readonly addVersion: SinonSpy;
    readonly eliminate: SinonSpy;
    readonly emit: SinonSpy;
    readonly linkBundle: SinonSpy;
    readonly linkedBundle: LinkedBundle;
    readonly resolve: SinonSpy;
    readonly versionedBundle: VersionedBundleWithManifest;
};

function stubDependencies(): ResolveAndBuildDependencies {
    return {
        deadCodeEliminator: {
            eliminate: fake.resolves([])
        },
        linker: {
            linkBundle: fake.resolves(createLinkedBundle())
        },
        progressBroadcaster: {
            emit() {
                return undefined;
            },
            hasSubscribers() {
                return false;
            }
        },
        resourceResolver: {
            resolve: fake.resolves(createLinkedBundle())
        },
        versionManager: {
            addVersion: fake.returns(createVersionedBundle()),
            increaseVersion: fake.returns(createVersionedBundle())
        }
    };
}

function createPipelineSpies(): PipelineSpies {
    const linkedBundle = createLinkedBundle();
    const analyzedBundle = createAnalyzedBundle();
    const versionedBundle = createVersionedBundle();
    const eliminate = fake.resolves([ analyzedBundle ]);
    const linkBundle = fake.resolves(linkedBundle);
    const emit = fake(function (): void {
        return undefined;
    });
    const resolve = fake.resolves(createLinkedBundle());
    const addVersion = fake.returns(versionedBundle);
    return {
        addVersion,
        eliminate,
        emit,
        linkBundle,
        linkedBundle,
        resolve,
        analyzedBundle,
        versionedBundle
    };
}

function createPipelineDependencies(
    overrides: Partial<ResolveAndBuildDependencies> = {}
): PipelineDependenciesFixture {
    const spies = createPipelineSpies();
    const dependencies: ResolveAndBuildDependencies = {
        deadCodeEliminator: {
            eliminate: spies.eliminate
        },
        linker: {
            linkBundle: spies.linkBundle
        },
        progressBroadcaster: {
            emit(...emitArguments: EmitArguments) {
                spies.emit(...emitArguments);
            },
            hasSubscribers: fake(function (eventName: string) {
                return eventName === 'scanCompleted' || eventName === 'linkingCompleted';
            })
        },
        resourceResolver: {
            resolve: spies.resolve
        },
        versionManager: {
            addVersion: spies.addVersion,
            increaseVersion: fake.returns(spies.versionedBundle)
        },
        ...overrides
    };
    return {
        dependencies,
        ...spies
    };
}

async function callResolveAndLinkWithMainPackageJson(
    operations: ResolveAndBuildOperations,
    mainPackageJson: InvalidMainPackageJson
): Promise<unknown> {
    const options: ResolveAndLinkOptions = Object.assign(createResolveOptions(), { mainPackageJson });
    return operations.resolveAndLink(options);
}

async function callBuildWithMainPackageJson(
    operations: ResolveAndBuildOperations,
    mainPackageJson: InvalidMainPackageJson
): Promise<unknown> {
    const options: BuildOptions = Object.assign(
        createBuildAndPublishOptions(),
        { mainPackageJson, version: '1.2.3' }
    );
    return operations.build(options);
}

suite('package-processor-build', function () {
    test('createResolveAndBuildOperations exposes the build and resolveAndLink operations', function () {
        const operations = createResolveAndBuildOperations(stubDependencies());

        assert.strictEqual(typeof operations.build, 'function');
        assert.strictEqual(typeof operations.resolveAndLink, 'function');
    });

    test('resolveAndLink rejects a non-ESM mainPackageJson at the operations layer', async function () {
        const operations = createResolveAndBuildOperations(stubDependencies());

        try {
            await callResolveAndLinkWithMainPackageJson(operations, { type: 'commonjs' });
            assert.fail('expected resolveAndLink to reject the non-ESM main package json');
        } catch (error) {
            assert.ok(error instanceof Error);
            assert.strictEqual(error.message, 'mainPackageJson.type must be "module"');
        }
    });

    test('build rejects a non-ESM mainPackageJson at the operations layer', async function () {
        const operations = createResolveAndBuildOperations(stubDependencies());

        try {
            await callBuildWithMainPackageJson(operations, { type: 'commonjs' });
            assert.fail('expected build to reject the non-ESM main package json');
        } catch (error) {
            assert.ok(error instanceof Error);
            assert.strictEqual(error.message, 'mainPackageJson.type must be "module"');
        }
    });

    test('resolveAndLink resolves resources, links bundle dependencies, and emits report events', async function () {
        const fixture = createPipelineDependencies();
        const operations = createResolveAndBuildOperations(fixture.dependencies);
        const options = createResolveOptions();

        const result = await operations.resolveAndLink(options);

        assert.deepStrictEqual(result, fixture.linkedBundle);
        assert.deepStrictEqual(
            fixture.resolve.firstCall.args[0],
            options
        );
        assert.deepStrictEqual(
            fixture.linkBundle.firstCall.args[0],
            {
                bundle: createLinkedBundle(),
                bundleDependencies: options.bundleDependencies,
                bundlePeerDependencies: options.bundlePeerDependencies
            }
        );
        assert.deepStrictEqual(getCallArgs(fixture.emit), [
            [ 'resolving', { packageName: 'package-a' } ],
            [ 'scanCompleted', { packageName: 'package-a', included: [], excluded: [] } ],
            [ 'linking', { packageName: 'package-a' } ],
            [ 'linkingCompleted', { packageName: 'package-a', rewrites: [] } ]
        ]);
    });

    test('build analyzes the linked bundle and versions the analyzed output', async function () {
        const fixture = createPipelineDependencies();
        const operations = createResolveAndBuildOperations(fixture.dependencies);
        const options = { ...createBuildAndPublishOptions(), version: '1.2.3' };

        const result = await operations.build(options);

        assert.deepStrictEqual(result, fixture.versionedBundle);
        assert.deepStrictEqual(
            fixture.resolve.firstCall.args[0],
            {
                name: 'package-a',
                sourcesFolder: '/src',
                roots: { main: { js: '/src/index.js' } },
                surface: { mode: 'implicit', defaultModuleRoot: 'main' },
                includeSourceMapFiles: true,
                additionalFiles: [ { sourceFilePath: '/src/readme.md', targetFilePath: 'readme.md' } ],
                mainPackageJson: options.mainPackageJson,
                additionalChangelogSourceFiles: { packageFiles: [], sharedFiles: [] },
                additionalPackageJsonAttributes: options.additionalPackageJsonAttributes,
                allowMutableSpecifiers: options.allowMutableSpecifiers,
                bundleDependencies: options.bundleDependencies,
                bundlePeerDependencies: options.bundlePeerDependencies
            }
        );
        assert.deepStrictEqual(
            fixture.eliminate.firstCall.args[0],
            [
                {
                    bundle: createLinkedBundle(),
                    transformationsEnabled: true,
                    deadCodeElimination: undefined
                }
            ]
        );
        assert.deepStrictEqual(
            fixture.addVersion.firstCall.args[0],
            {
                bundle: fixture.analyzedBundle,
                version: '1.2.3',
                mainPackageJson: options.mainPackageJson,
                bundleDependencies: options.bundleDependencies,
                bundlePeerDependencies: options.bundlePeerDependencies,
                additionalPackageJsonAttributes: options.additionalPackageJsonAttributes,
                allowMutableSpecifiers: options.allowMutableSpecifiers
            }
        );
    });

    test('build passes disabled dead-code transformation settings to the eliminator', async function () {
        const fixture = createPipelineDependencies();
        const operations = createResolveAndBuildOperations(fixture.dependencies);

        await operations.build({
            ...createBuildAndPublishOptions(),
            version: '1.2.3',
            deadCodeElimination: { enabled: false }
        });

        assert.deepStrictEqual(
            fixture.eliminate.firstCall.args[0],
            [
                {
                    bundle: createLinkedBundle(),
                    transformationsEnabled: false,
                    deadCodeElimination: { enabled: false }
                }
            ]
        );
    });

    test('build rejects when the dead code eliminator returns no analyzed bundle', async function () {
        const deadCodeEliminator: DeadCodeEliminator = {
            eliminate: fake.resolves([])
        };
        const { dependencies } = createPipelineDependencies({
            deadCodeEliminator
        });
        const operations = createResolveAndBuildOperations(dependencies);

        await assert.rejects(
            operations.build({ ...createBuildAndPublishOptions(), version: '1.2.3' }),
            { message: 'Dead code eliminator returned no bundle for "package-a"' }
        );
    });
});
