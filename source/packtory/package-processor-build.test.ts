/* eslint-disable @typescript-eslint/consistent-type-assertions -- test stubs cast partial mocks of complex orchestrator types */
import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake } from 'sinon';
import type { AnalyzedBundle, DeadCodeEliminator } from '../dead-code-eliminator/analyzed-bundle.ts';
import type { LinkedBundle } from '../linker/linked-bundle.ts';
import type { ResourceResolver } from '../resource-resolver/resource-resolver.ts';
import type { VersionManager } from '../version-manager/manager.ts';
import type { VersionedBundleWithManifest } from '../version-manager/versioned-bundle.ts';
import {
    createAnalyzedBundle,
    createBuildAndPublishOptions,
    createLinkedBundle,
    createResolveOptions,
    createVersionedBundle,
    getCallArgs
} from '../test-libraries/package-processor-test-support.ts';
import { createResolveAndBuildOperations, type ResolveAndBuildDependencies } from './package-processor-build.ts';

type PipelineDependenciesFixture = {
    readonly analyzedBundle: AnalyzedBundle;
    readonly dependencies: ResolveAndBuildDependencies;
    readonly linkedBundle: LinkedBundle;
    readonly versionedBundle: VersionedBundleWithManifest;
};

function stubDependencies(): ResolveAndBuildDependencies {
    return {
        deadCodeEliminator: {} as DeadCodeEliminator,
        linker: {} as ResolveAndBuildDependencies['linker'],
        progressBroadcaster: {
            emit() {
                return undefined;
            },
            hasSubscribers() {
                return false;
            }
        },
        resourceResolver: {} as ResourceResolver,
        versionManager: {} as VersionManager
    };
}

function createPipelineDependencies(
    overrides: Partial<ResolveAndBuildDependencies> = {}
): PipelineDependenciesFixture {
    const hasSubscribers = fake(function (eventName: string) {
        return eventName === 'scanCompleted' || eventName === 'linkingCompleted';
    });
    const linkedBundle = createLinkedBundle();
    const analyzedBundle = createAnalyzedBundle();
    const versionedBundle = createVersionedBundle();
    const dependencies: ResolveAndBuildDependencies = {
        deadCodeEliminator: {
            eliminate: fake.resolves([ analyzedBundle ])
        },
        linker: {
            linkBundle: fake.resolves(linkedBundle)
        },
        progressBroadcaster: {
            emit: fake(),
            hasSubscribers
        },
        resourceResolver: {
            resolve: fake.resolves(createLinkedBundle())
        },
        versionManager: {
            addVersion: fake.returns(versionedBundle),
            increaseVersion: fake.returns(versionedBundle)
        },
        ...overrides
    };
    return { dependencies, analyzedBundle, linkedBundle, versionedBundle };
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
            await operations.resolveAndLink({ mainPackageJson: { type: 'commonjs' } } as never);
            assert.fail('expected resolveAndLink to reject the non-ESM main package json');
        } catch (error) {
            assert.ok(error instanceof Error);
            assert.strictEqual(error.message, 'mainPackageJson.type must be "module"');
        }
    });

    test('build rejects a non-ESM mainPackageJson at the operations layer', async function () {
        const operations = createResolveAndBuildOperations(stubDependencies());

        try {
            await operations.build({ mainPackageJson: { type: 'commonjs' } } as never);
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
            (fixture.dependencies.resourceResolver.resolve as never as ReturnType<typeof fake>).firstCall.args[0],
            options
        );
        assert.deepStrictEqual(
            (fixture.dependencies.linker.linkBundle as never as ReturnType<typeof fake>).firstCall.args[0],
            {
                bundle: createLinkedBundle(),
                bundleDependencies: [ ...options.bundleDependencies, ...options.bundlePeerDependencies ]
            }
        );
        assert.deepStrictEqual(getCallArgs(fixture.dependencies.progressBroadcaster.emit as never), [
            [ 'resolving', { packageName: 'package-a' } ],
            [ 'scanCompleted', { packageName: 'package-a', included: [], excluded: [] } ],
            [ 'linking', { packageName: 'package-a' } ],
            [ 'linkingCompleted', { packageName: 'package-a', rewrites: [] } ]
        ]);
    });

    test('build analyzes the linked bundle and versions the analyzed output', async function () {
        const { dependencies, analyzedBundle, versionedBundle } = createPipelineDependencies();
        const operations = createResolveAndBuildOperations(dependencies);
        const options = { ...createBuildAndPublishOptions(), version: '1.2.3' };

        const result = await operations.build(options);

        assert.deepStrictEqual(result, versionedBundle);
        assert.deepStrictEqual(
            (dependencies.resourceResolver.resolve as never as ReturnType<typeof fake>).firstCall.args[0],
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
            (dependencies.deadCodeEliminator.eliminate as never as ReturnType<typeof fake>).firstCall.args[0],
            [
                {
                    bundle: createLinkedBundle(),
                    transformationsEnabled: true,
                    deadCodeElimination: undefined
                }
            ]
        );
        assert.deepStrictEqual(
            (dependencies.versionManager.addVersion as never as ReturnType<typeof fake>).firstCall.args[0],
            {
                bundle: analyzedBundle,
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
        const { dependencies } = createPipelineDependencies();
        const operations = createResolveAndBuildOperations(dependencies);

        await operations.build({
            ...createBuildAndPublishOptions(),
            version: '1.2.3',
            deadCodeElimination: { enabled: false }
        });

        assert.deepStrictEqual(
            (dependencies.deadCodeEliminator.eliminate as never as ReturnType<typeof fake>).firstCall.args[0],
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
        const { dependencies } = createPipelineDependencies({
            deadCodeEliminator: {
                eliminate: fake.resolves([])
            } as unknown as DeadCodeEliminator
        });
        const operations = createResolveAndBuildOperations(dependencies);

        await assert.rejects(
            operations.build({ ...createBuildAndPublishOptions(), version: '1.2.3' }),
            { message: 'Dead code eliminator returned no bundle for "package-a"' }
        );
    });
});
