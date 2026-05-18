import assert from 'node:assert';
import { test } from 'mocha';
import { createFakeFileManager } from '../test-libraries/fake-file-manager.ts';
import { writeArtifactsToFolder } from './folder-writer.ts';

test('writeArtifactsToFolder throws when the target folder is already readable', async () => {
    const fileManager = createFakeFileManager({
        simulatedCheckReadabilityResponses: [{ value: { isReadable: true } }]
    });

    try {
        await writeArtifactsToFolder(fileManager, '/target', []);
        assert.fail('Expected writeArtifactsToFolder() to throw but it did not');
    } catch (error: unknown) {
        assert.strictEqual((error as Error).message, 'Folder /target already exists');
    }
});

test('writeArtifactsToFolder writes each entry to the joined target path', async () => {
    const fileManager = createFakeFileManager({
        simulatedCheckReadabilityResponses: [{ value: { isReadable: false } }]
    });

    await writeArtifactsToFolder(fileManager, '/target', [
        { filePath: 'a.txt', content: 'a', isExecutable: false },
        { filePath: 'nested/b.txt', content: 'b', isExecutable: false }
    ]);

    assert.strictEqual(fileManager.getWriteFileCallCount(), 2);
    assert.deepStrictEqual(fileManager.getWriteFileCall(0), { filePath: '/target/a.txt', content: 'a' });
    assert.deepStrictEqual(fileManager.getWriteFileCall(1), { filePath: '/target/nested/b.txt', content: 'b' });
});

test('writeArtifactsToFolder records each entry on the file manager in order', async () => {
    const fileManager = createFakeFileManager({
        simulatedCheckReadabilityResponses: [{ value: { isReadable: false } }]
    });

    await writeArtifactsToFolder(fileManager, '/target', [
        { filePath: 'cli.js', content: '#!/usr/bin/env node', isExecutable: true },
        { filePath: 'data.txt', content: 'data', isExecutable: false }
    ]);

    assert.deepStrictEqual(fileManager.getWriteFileCall(0), {
        filePath: '/target/cli.js',
        content: '#!/usr/bin/env node'
    });
    assert.deepStrictEqual(fileManager.getWriteFileCall(1), { filePath: '/target/data.txt', content: 'data' });
});
