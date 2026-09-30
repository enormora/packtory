import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createFakeFileManager } from '../../test-libraries/fake-file-manager.ts';
import { readCanaryManifest, selectCanary } from './canary-manifest.ts';

const validManifest = [
    {
        failureMode: 'non-blocking',
        installCommand: 'npm clean-install --ignore-scripts',
        name: 'sample',
        publishCommand: 'npx just packtory-dry-run',
        ref: 'main',
        repository: 'https://github.com/enormora/objectory.git'
    }
] as const;

suite('canary-manifest', function () {
    test('readCanaryManifest accepts explicit canary entries', async function () {
        const fileManager = createFakeFileManager({
            simulatedReadFileResponses: [ { value: JSON.stringify(validManifest) } ]
        });

        assert.deepStrictEqual(await readCanaryManifest('canary-tests/canaries.json', fileManager), validManifest);
    });

    test('readCanaryManifest rejects duplicate names', async function () {
        const fileManager = createFakeFileManager({
            simulatedReadFileResponses: [ { value: JSON.stringify([ ...validManifest, ...validManifest ]) } ]
        });

        await assert.rejects(
            async function () {
                await readCanaryManifest('canary-tests/canaries.json', fileManager);
            },
            /Duplicate canary names: sample/u
        );
    });

    test('readCanaryManifest reads through the file manager', async function () {
        const fileManager = createFakeFileManager({
            simulatedReadFileResponses: [ { value: JSON.stringify(validManifest) } ]
        });

        assert.deepStrictEqual(await readCanaryManifest('canary-tests/canaries.json', fileManager), validManifest);
        assert.deepStrictEqual(fileManager.getReadFileCall(0), { filePath: 'canary-tests/canaries.json' });
    });

    test('selectCanary rejects missing entries', function () {
        assert.throws(
            function () {
                selectCanary(validManifest, 'missing');
            },
            /Canary "missing" is not declared/u
        );
    });
});
