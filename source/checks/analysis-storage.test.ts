import assert from 'node:assert';
import { suite, test } from 'mocha';
import { z } from 'zod/mini';
import { withCompilerWorkspace } from '../test-libraries/compiler-workspace.ts';
import { createAnalysisStorage } from './analysis-storage.ts';

const resultSchema = z.array(z.string());

suite('analysis storage', function () {
    test('rejects partially overwritten cache entries', async function () {
        await withCompilerWorkspace(async function (workspace) {
            const dependencies = {
                ...workspace,
                repositoryFolder: workspace.folder,
                async toolIdentity() {
                    return 'test';
                }
            };
            const writer = createAnalysisStorage({
                ...dependencies,
                fileManager: {
                    ...workspace.fileManager,
                    async writeFile(filePath, value) {
                        await workspace.fileManager.writeFile(filePath, value.replace('original', 'corrupted'));
                    }
                }
            });
            assert.strictEqual(await writer.write('entry', [ 'original' ]), true);
            assert.strictEqual(await createAnalysisStorage(dependencies).read('entry', resultSchema), null);
        });
    });

    test('reuses validated results across storage instances and distinguishes keys and tool versions', async function () {
        await withCompilerWorkspace(async function (workspace) {
            const storage = createAnalysisStorage({
                ...workspace,
                repositoryFolder: workspace.folder,
                async toolIdentity() {
                    return 'first';
                }
            });
            assert.strictEqual(await storage.write([ 'analysis', 1 ], [ 'reported issue' ]), true);
            assert.deepStrictEqual(await storage.read([ 'analysis', 1 ], resultSchema), [ 'reported issue' ]);
            assert.strictEqual(await storage.read([ 'analysis', 2 ], resultSchema), null);
            const changed = createAnalysisStorage({
                ...workspace,
                repositoryFolder: workspace.folder,
                async toolIdentity() {
                    return 'second';
                }
            });
            assert.strictEqual(await changed.read([ 'analysis', 1 ], resultSchema), null);
            const independent = createAnalysisStorage({
                ...workspace,
                repositoryFolder: workspace.folder,
                async toolIdentity() {
                    return 'first';
                }
            });
            assert.deepStrictEqual(await independent.read([ 'analysis', 1 ], resultSchema), [ 'reported issue' ]);
            assert.deepStrictEqual(
                await workspace.fileManager.checkDirectory(
                    `${workspace.folder}/node_modules/.cache/packtory`
                ),
                { exists: true, isDirectory: true }
            );
        });
    });

    test('rejects invalid stored data', async function () {
        await withCompilerWorkspace(async function (workspace) {
            await workspace.storage.write('invalid-schema', { unexpected: true });
            assert.strictEqual(await workspace.storage.read('invalid-schema', resultSchema), null);
            const storage = createAnalysisStorage({
                repositoryFolder: workspace.folder,
                fileManager: {
                    ...workspace.fileManager,
                    async readFile() {
                        return '{';
                    }
                },
                async toolIdentity() {
                    return 'test';
                }
            });
            assert.strictEqual(await storage.read('invalid-json', resultSchema), null);
        });
    });

    test('treats unavailable storage and tool identity as cache misses', async function () {
        await withCompilerWorkspace(async function (workspace) {
            const storage = createAnalysisStorage({
                repositoryFolder: workspace.folder,
                fileManager: {
                    ...workspace.fileManager,
                    async writeFile() {
                        throw new Error('Read-only filesystem');
                    }
                },
                async toolIdentity() {
                    return 'test';
                }
            });
            assert.strictEqual(await storage.write('memory', [ 'result' ]), false);
            assert.deepStrictEqual(await storage.read('memory', resultSchema), [ 'result' ]);
            const unidentified = createAnalysisStorage({
                ...workspace,
                repositoryFolder: workspace.folder,
                async toolIdentity() {
                    throw new Error('Unavailable');
                }
            });
            assert.strictEqual(await unidentified.write('key', [ 'result' ]), false);
            assert.strictEqual(await unidentified.read('key', resultSchema), null);
        });
    });

    for (const scenario of [ { count: 32, diskReads: 0 }, { count: 33, diskReads: 1 } ]) {
        test(`bounds retained results after ${scenario.count} writes`, async function () {
            await withCompilerWorkspace(async function (workspace) {
                let reads = 0;
                const storage = createAnalysisStorage({
                    repositoryFolder: workspace.folder,
                    async toolIdentity() {
                        return 'test';
                    },
                    fileManager: {
                        ...workspace.fileManager,
                        async readFile(filePath) {
                            reads += 1;
                            return workspace.fileManager.readFile(filePath);
                        }
                    }
                });
                for (let index = 0; index < scenario.count; index += 1) {
                    await storage.write(index, [ String(index) ]);
                }
                assert.deepStrictEqual(await storage.read(0, resultSchema), [ '0' ]);
                assert.strictEqual(reads, scenario.diskReads);
            });
        });
    }
});
