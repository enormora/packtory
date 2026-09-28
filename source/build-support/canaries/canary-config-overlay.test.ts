import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createFakeFileManager } from '../../test-libraries/fake-file-manager.ts';
import { writeCanaryConfigOverlay } from './canary-config-overlay.ts';

suite('canary-config-overlay', function () {
    test('writeCanaryConfigOverlay preserves the original file and forces canary settings', async function () {
        const fileManager = createFakeFileManager();

        await writeCanaryConfigOverlay({ cloneFolder: '/clone', fileManager });

        assert.deepStrictEqual(fileManager.getCopyFileCall(0), {
            from: '/clone/packtory.config.js',
            to: '/clone/packtory.config.canary-original.js'
        });
        const write = fileManager.getWriteFileCall(0);
        assert.strictEqual(write.filePath, '/clone/packtory.config.js');
        assert.match(write.content, /sbom: \{ \.\.\.settings\.sbom, enabled: false \}/u);
        assert.match(write.content, /function withCommonSettings/u);
        assert.match(write.content, /commonPackageSettings: withCommonSettings\(config\.commonPackageSettings\)/u);
        assert.match(write.content, /enabled: true/u);
        assert.match(write.content, /export async function buildConfig/u);
    });
});
