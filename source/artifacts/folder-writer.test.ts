import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createFakeFileManager } from '../test-libraries/fake-file-manager.ts';
import { writeArtifactsToFolder } from './folder-writer.ts';

suite('folder-writer', function () {
    test('writeArtifactsToFolder throws when the target folder is already readable', async function () {
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

    test('writeArtifactsToFolder writes each entry to the joined target path', async function () {
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

    test('writeArtifactsToFolder records each entry on the file manager in order', async function () {
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

    test('writeArtifactsToFolder copies vendor entries byte-for-byte after writing inline contents', async function () {
        const fileManager = createFakeFileManager({
            simulatedCheckReadabilityResponses: [{ value: { isReadable: false } }]
        });

        await writeArtifactsToFolder(
            fileManager,
            '/target',
            [{ filePath: 'inline.txt', content: 'inline', isExecutable: false }],
            [
                {
                    sourceAbsolutePath: '/repo/node_modules/pkg/index.js',
                    sourcePackageRootPath: '/repo/node_modules/pkg',
                    targetRelativePath: 'node_modules/pkg/index.js',
                    isExecutable: false
                }
            ]
        );

        assert.strictEqual(fileManager.getWriteFileCallCount(), 1);
        assert.deepStrictEqual(fileManager.getCopyFileBytesCall(0), {
            from: '/repo/node_modules/pkg/index.js',
            to: '/target/node_modules/pkg/index.js'
        });
    });

    test('writeArtifactsToFolder revalidates vendor source paths before copying', async function () {
        const fileManager = createFakeFileManager({
            simulatedCheckReadabilityResponses: [{ value: { isReadable: false } }],
            simulatedRealPathResponses: [{ value: '/repo/secret.js' }]
        });

        await assert.rejects(
            writeArtifactsToFolder(
                fileManager,
                '/target',
                [],
                [
                    {
                        sourceAbsolutePath: '/repo/node_modules/pkg/index.js',
                        sourcePackageRootPath: '/repo/node_modules/pkg',
                        targetRelativePath: 'node_modules/pkg/index.js',
                        isExecutable: false
                    }
                ]
            ),
            {
                message:
                    'Vendored file "/repo/node_modules/pkg/index.js" resolved outside package root ' +
                    '"/repo/node_modules/pkg"'
            }
        );
        assert.strictEqual(fileManager.getCopyFileBytesCallCount(), 0);
    });
});
