import assert from 'node:assert';
import fileSystem from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir as temporaryDirectory } from 'node:os';
import path from 'node:path';
import { pathToFileURL as pathToFileAddress } from 'node:url';
import { suite, test } from 'mocha';
import { createFileManager } from '../../file-manager/file-manager.ts';
import { createFakeFileManager } from '../../test-libraries/fake-file-manager.ts';
import { writeCanaryConfigurationOverlay } from './canary-configuration-overlay.ts';

type OverlayFixture = {
    readonly originalSource: string;
    readonly expected: unknown;
};

function overlayFixture(spelling: string): OverlayFixture {
    const billOfMaterialsField = spelling === 'config' || spelling === 'buildConfig'
        ? 'sbom'
        : 'softwareBillOfMaterials';
    const settings = {
        registry: 'https://example.com',
        [billOfMaterialsField]: { enabled: true, format: 'json' }
    };
    const configuration = {
        commonPackageSettings: { publishSettings: settings },
        packages: [ { name: 'sample', deadCodeElimination: { enabled: false }, publishSettings: settings } ]
    };
    const originalSource = spelling.startsWith('build')
        ? `export async function ${spelling}() { return ${JSON.stringify(configuration)}; }`
        : `export const ${spelling} = ${JSON.stringify(configuration)};`;
    const publishSettings = {
        ...settings,
        [billOfMaterialsField]: { enabled: false, format: 'json' }
    };
    const expected = {
        commonPackageSettings: { deadCodeElimination: { enabled: true }, publishSettings },
        packages: [ { name: 'sample', deadCodeElimination: { enabled: true }, publishSettings } ]
    };
    return { originalSource, expected };
}

async function assertOverlaySettings(cloneFolder: string, expected: unknown): Promise<void> {
    const overlay = await import(pathToFileAddress(path.join(cloneFolder, 'packtory.config.js')).href) as {
        readonly buildConfiguration: () => Promise<unknown>;
        readonly buildConfig: () => Promise<unknown>;
    };
    assert.deepStrictEqual(await overlay.buildConfiguration(), expected);
    assert.deepStrictEqual(await overlay.buildConfig(), expected);
}

suite('canary-config-overlay', function () {
    test('writeCanaryConfigurationOverlay preserves the original file and forces canary settings', async function () {
        const fileManager = createFakeFileManager();

        await writeCanaryConfigurationOverlay({ cloneFolder: '/clone', fileManager });

        assert.deepStrictEqual(fileManager.getCopyFileCall(0), {
            from: '/clone/packtory.config.js',
            to: '/clone/packtory.config.canary-original.js'
        });
        const write = fileManager.getWriteFileCall(0);
        assert.strictEqual(write.filePath, '/clone/packtory.config.js');
        assert.match(write.content, /packtory\.config\.canary-original\.js/u);
    });

    for (const spelling of [ 'configuration', 'buildConfiguration', 'config', 'buildConfig' ]) {
        test(`executes the overlay for ${spelling} without losing original settings`, async function () {
            const cloneFolder = await mkdtemp(path.join(temporaryDirectory(), 'packtory-overlay-'));
            const fileManager = createFileManager({ hostFileSystem: fileSystem.promises });
            const { originalSource, expected } = overlayFixture(spelling);
            try {
                await fileManager.writeFile(path.join(cloneFolder, 'package.json'), '{"type":"module"}');
                await fileManager.writeFile(path.join(cloneFolder, 'packtory.config.js'), originalSource);
                await writeCanaryConfigurationOverlay({ cloneFolder, fileManager });
                await assertOverlaySettings(cloneFolder, expected);
                assert.strictEqual(
                    await fileManager.readFile(path.join(cloneFolder, 'packtory.config.canary-original.js')),
                    originalSource
                );
            } finally {
                await rm(cloneFolder, { recursive: true, force: true });
            }
        });
    }
});
