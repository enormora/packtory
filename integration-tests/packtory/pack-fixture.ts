import path from 'node:path';
import assert from 'node:assert';
import { inspect } from 'node:util';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir as temporaryDirectory } from 'node:os';
import { packPackage } from '../../source/packages/packtory/packtory.entry-point.ts';
import { getFixturePath, type PackageConfiguration } from './publish-fixture-support.ts';

export async function packFixture(fixture: string, configuration: PackageConfiguration): Promise<string> {
    const consumer = await mkdtemp(path.join(temporaryDirectory(), 'packtory-no-js-'));
    const outcome = await packPackage({
        commonPackageSettings: {
            sourcesFolder: path.join(getFixturePath(fixture), 'source'),
            mainPackageManifest: { type: 'module' },
            publishSettings: { access: 'public' }
        },
        checks: { typeScriptIntegrity: { enabled: true } },
        packages: [ configuration ]
    }, {
        packageName: configuration.name,
        outputPath: path.join(consumer, 'node_modules', configuration.name),
        format: 'folder',
        version: '1.2.3',
        vendorDependencies: false
    });
    assert.strictEqual(outcome.result.isOk, true, inspect(outcome.result));
    return consumer;
}
