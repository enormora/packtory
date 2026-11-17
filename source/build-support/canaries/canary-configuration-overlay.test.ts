import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createFakeFileManager } from '../../test-libraries/fake-file-manager.ts';
import { writeCanaryConfigurationOverlay } from './canary-configuration-overlay.ts';

suite('canary-config-overlay', function () {
    test('writeCanaryConfigurationOverlay preserves the original file and forces canary settings', async function () {
        const fileManager = createFakeFileManager();
        await writeCanaryConfigurationOverlay({
            cloneFolder: '/clone',
            fileManager
        });
        assert.deepStrictEqual(fileManager.getCopyFileCall(0), {
            from: '/clone/packtory.config.js',
            to: '/clone/packtory.config.canary-original.js'
        });
        const write = fileManager.getWriteFileCall(0);
        assert.strictEqual(write.filePath, '/clone/packtory.config.js');
        assert.match(write.content, /packtory\.config\.canary-original\.js/u);
    });
});
