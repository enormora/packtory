import path from 'node:path';
import assert from 'node:assert';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir as temporaryDirectory } from 'node:os';
import { suite, test } from 'mocha';
import {
    packAllPackages,
    packPackage,
    type PacktoryConfiguration
} from '../../source/packages/packtory/packtory.entry-point.ts';
import { loadPackageManifest } from '../load-package-manifest.ts';
import {
    createPackageConfiguration,
    createPackageConfigurationList,
    getFixturePath
} from './publish-fixture-support.ts';

async function createPackConfiguration(fixturePath: string): Promise<PacktoryConfiguration> {
    return {
        commonPackageSettings: {
            sourcesFolder: path.join(fixturePath, 'source'),
            mainPackageManifest: await loadPackageManifest(fixturePath),
            publishSettings: { access: 'public' },
            deadCodeElimination: { enabled: false }
        },
        packages: createPackageConfigurationList(
            createPackageConfiguration(fixturePath, 'second', 'entry2'),
            createPackageConfiguration(fixturePath, 'third', 'entry3', { bundlePeerDependencies: [ 'second' ] })
        )
    };
}

suite('pack', function () {
    test('writes configured bundle peer dependencies into packed package metadata', async function () {
        const fixturePath = getFixturePath('multiple-packages-with-substitution');
        const outputPath = path.join(await mkdtemp(path.join(temporaryDirectory(), 'packtory-pack-')), 'third');

        const outcome = await packPackage(await createPackConfiguration(fixturePath), {
            packageName: 'third',
            format: 'folder',
            outputPath,
            version: '1.2.3',
            vendorDependencies: false
        });

        assert.strictEqual(outcome.result.isOk, true);
        assert.partialDeepStrictEqual(
            JSON.parse(await readFile(path.join(outputPath, 'package.json'), 'utf8')),
            {
                name: 'third',
                version: '1.2.3',
                peerDependencies: { second: '1.2.3' }
            }
        );
        assert.strictEqual(
            await readFile(path.join(outputPath, 'entry3.d.ts'), 'utf8'),
            "export declare const foo: import('second').Foo;\n"
        );
    });

    test('writes every configured package into a package-named folder', async function () {
        const fixturePath = getFixturePath('multiple-packages-with-substitution');
        const outputPath = path.join(await mkdtemp(path.join(temporaryDirectory(), 'packtory-pack-all-')), 'packages');

        const outcome = await packAllPackages(await createPackConfiguration(fixturePath), {
            outputPath,
            version: '2.3.4',
            vendorDependencies: false
        });

        assert.deepStrictEqual(
            outcome.result.isOk ? outcome.result.value : 'errored',
            { packageNames: [ 'second', 'third' ] }
        );
        assert.partialDeepStrictEqual(
            JSON.parse(await readFile(path.join(outputPath, 'second', 'package.json'), 'utf8')),
            { name: 'second', version: '2.3.4' }
        );
        assert.partialDeepStrictEqual(
            JSON.parse(await readFile(path.join(outputPath, 'third', 'package.json'), 'utf8')),
            { name: 'third', version: '2.3.4' }
        );
        assert.strictEqual(
            await readFile(path.join(outputPath, 'third', 'entry3.d.ts'), 'utf8'),
            "export declare const foo: import('second').Foo;\n"
        );
    });
});
