/* eslint-disable @typescript-eslint/consistent-type-assertions -- test stubs cast partial mocks of complex orchestrator types */
import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { DeadCodeEliminator } from '../dead-code-eliminator/analyzed-bundle.ts';
import type { BundleLinker } from '../linker/linker.ts';
import type { ResourceResolver } from '../resource-resolver/resource-resolver.ts';
import type { VersionManager } from '../version-manager/manager.ts';
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
});
