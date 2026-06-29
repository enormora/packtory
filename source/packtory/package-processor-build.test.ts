/* eslint-disable @typescript-eslint/consistent-type-assertions -- test stubs cast partial mocks of complex orchestrator types */
import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake } from 'sinon';
import type { AnalyzedBundle, DeadCodeEliminator } from '../dead-code-eliminator/analyzed-bundle.ts';
import type { BundleLinker } from '../linker/linker.ts';
import type { ResourceResolver } from '../resource-resolver/resource-resolver.ts';
import type { VersionManager } from '../version-manager/manager.ts';
import type { BuildOptions } from './map-config.ts';
import { createResolveAndBuildOperations, type ResolveAndBuildDependencies } from './package-processor-build.ts';

function stubDependencies(): ResolveAndBuildDependencies {
    return {
        deadCodeEliminator: {} as DeadCodeEliminator,
        linker: {} as BundleLinker,
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

function createBuildOptions(): BuildOptions {
    return {
        additionalFiles: [],
        additionalPackageJsonAttributes: {},
        allowMutableSpecifiers: [],
        bundleDependencies: [],
        bundlePeerDependencies: [],
        includeSourceMapFiles: false,
        mainPackageJson: { type: 'module' },
        name: 'pkg-a',
        roots: { main: { js: '/repo/source/index.js' } },
        sourcesFolder: '/repo/source',
        version: '1.0.0'
    };
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

    test('build resolves without package or shared changelog source files', async function () {
        const resolvedBundle = { name: 'pkg-a' } as unknown as Awaited<ReturnType<ResourceResolver['resolve']>>;
        const linkedBundle = { name: 'pkg-a' } as unknown as Awaited<ReturnType<BundleLinker['linkBundle']>>;
        const analyzedBundle = { name: 'pkg-a' } as unknown as AnalyzedBundle;
        const resolve = fake.resolves(resolvedBundle);
        const dependencies: ResolveAndBuildDependencies = {
            ...stubDependencies(),
            resourceResolver: { resolve },
            linker: { linkBundle: fake.resolves(linkedBundle) },
            deadCodeEliminator: {
                eliminate: fake.resolves([ analyzedBundle ])
            },
            versionManager: {
                addVersion: fake.resolves({ name: 'pkg-a', version: '1.0.0' }),
                increaseVersion: fake()
            }
        };

        await createResolveAndBuildOperations(dependencies).build(createBuildOptions());

        const resolveOptions = resolve.firstCall.args[0] as {
            readonly additionalChangelogSourceFiles: {
                readonly packageFiles: readonly string[];
                readonly sharedFiles: readonly string[];
            };
        };
        assert.deepStrictEqual(resolveOptions.additionalChangelogSourceFiles, {
            packageFiles: [],
            sharedFiles: []
        });
    });
});
