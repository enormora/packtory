import assert from 'node:assert';
import { suite, test } from 'mocha';
import { Result } from 'true-myth';
import { analyzedBundle, analyzedBundleResource } from '../test-libraries/bundle-fixtures.ts';
import {
    baseOptions,
    createDependencies,
    makeResolvedPackage,
    packEmitterInput,
    validatedConfig,
    type PackEmitterInput
} from '../test-libraries/packtory-pack-test-support.ts';
import { createProgressBroadcaster } from '../progress/progress-broadcaster.ts';
import { createVersionManager } from '../version-manager/manager.ts';
import type { ResolvedPackage } from './resolved-package.ts';
import { createRunPackValidated } from './packtory-pack.ts';

function basePackage(): ResolvedPackage {
    return {
        ...makeResolvedPackage({ name: 'base' }),
        analyzedBundle: analyzedBundle({
            name: 'base',
            contents: [
                analyzedBundleResource('/src/index.js', { targetFilePath: 'index.js' }),
                analyzedBundleResource('/src/rules.js', { targetFilePath: 'rules.js' }),
                analyzedBundleResource('/src/rules.d.ts', { targetFilePath: 'rules.d.ts' })
            ]
        })
    };
}

function consumerPackage(): ResolvedPackage {
    const consumer = makeResolvedPackage({
        name: 'consumer',
        bundleDependencyNames: [ 'base' ],
        bundleDependencies: [ { name: 'base' } ]
    });
    return {
        ...consumer,
        analyzedBundle: analyzedBundle({
            name: 'consumer',
            linkedBundleDependencies: consumer.analyzedBundle.linkedBundleDependencies,
            contents: [ analyzedBundleResource('/src/index.js', { content: 'import "base/rules.js";' }) ]
        })
    };
}

async function packPublicModuleFixture(packageName: string, vendorDependencies: boolean): Promise<PackEmitterInput> {
    const { dependencies, fakes } = createDependencies({
        resolveResult: Result.ok([ basePackage(), consumerPackage() ])
    });
    const runPack = createRunPackValidated({
        ...dependencies,
        versionManager: createVersionManager({ progressBroadcaster: createProgressBroadcaster().provider })
    });
    const result = await runPack(
        validatedConfig,
        { ...baseOptions, packageName, vendorDependencies },
        fakes.resolveAndLinkAll
    );
    assert.strictEqual(result.isOk, true);
    return packEmitterInput(fakes.packEmitterPack);
}

suite('packtory-pack public modules', function () {
    test('exposes sibling-used modules in the packed package manifest', async function () {
        const packed = await packPublicModuleFixture('base', false);
        assert.partialDeepStrictEqual(JSON.parse(packed.bundle.manifestFile.content), {
            exports: { './rules.js': { import: './rules.js' } }
        });
    });

    test('exposes sibling-used modules in vendored bundle manifests', async function () {
        const packed = await packPublicModuleFixture('consumer', true);
        const manifest = packed.extraFiles.find(function (file) {
            return file.filePath === 'node_modules/base/package.json';
        });
        assert.notStrictEqual(manifest, undefined);
        assert.partialDeepStrictEqual(JSON.parse(manifest?.content ?? '{}'), {
            exports: { './rules.js': { import: './rules.js' } }
        });
    });
});
