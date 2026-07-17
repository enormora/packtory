import path from 'node:path';
import assert from 'node:assert';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { suite, test } from 'mocha';
import {
    packPackage,
    type PacktoryConfig
} from '../../source/packages/packtory/packtory.entry-point.ts';
import { loadPackageJson } from '../load-package-json.ts';
import {
    createPackageConfig,
    createPackageConfigList,
    getFixturePath
} from './publish-fixture-support.ts';

async function createPackConfig(fixturePath: string): Promise<PacktoryConfig> {
    return {
        commonPackageSettings: {
            sourcesFolder: path.join(fixturePath, 'src'),
            mainPackageJson: await loadPackageJson(fixturePath),
            publishSettings: { access: 'public' },
            deadCodeElimination: { enabled: false }
        },
        packages: createPackageConfigList(
            createPackageConfig(fixturePath, 'second', 'entry2'),
            createPackageConfig(fixturePath, 'third', 'entry3', { bundlePeerDependencies: [ 'second' ] })
        )
    };
}

suite('pack', function () {
    test('writes configured bundle peer dependencies into packed package metadata', async function () {
        const fixturePath = getFixturePath('multiple-packages-with-substitution');
        const outputPath = path.join(await mkdtemp(path.join(tmpdir(), 'packtory-pack-')), 'third');

        const outcome = await packPackage(await createPackConfig(fixturePath), {
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
    });
});
